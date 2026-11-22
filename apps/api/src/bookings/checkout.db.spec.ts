import {
  BadRequestException,
  ConflictException,
  GoneException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentSession } from '@cineseat/shared';
import { IsNull, Not } from 'typeorm';
import { Booking, BookingSeat, Coupon, Notification, Payment, User } from '../database/entities';
import { HoldsService } from '../holds/holds.service';
import { MockGatewayService } from '../mock-gateway/mock-gateway.service';
import type { MockWebhookSender } from '../mock-gateway/mock-webhook.sender';
import type { MockEvent } from '../payments/mock-event';
import { MockPaymentProvider } from '../payments/mock-payment-provider';
import { signMockEvent } from '../payments/mock-signature';
import { PaymentEventsService } from '../payments/payment-events.service';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../shows/testing/schedule-fixture';
import { BookingsService } from './bookings.service';
import { CheckoutService } from './checkout.service';

const MINUTE = 60_000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);
const SECRET = 'test-only-mock-payment-secret';
const VISA_OK = {
  method: 'CARD',
  cardNumber: '4242424242424242',
  expiry: '12/30',
  cvc: '123',
  name: 'Alice',
} as const;
const VISA_DECLINED = { ...VISA_OK, cardNumber: '4000000000000002' } as const;

/**
 * Checkout end to end on a real SQLite file: hold → quote → pay → the test
 * gateway → its signed webhook → the booking. "sat" is a Saturday show in an
 * empty 3×4 hall (A ৳400, B ৳500, C ৳600); "tonight" is a Thursday show.
 */
describe('Checkout and mock payments (SQLite)', () => {
  let f: ScheduleFixture;
  let holds: HoldsService;
  let checkout: CheckoutService;
  let gateway: MockGatewayService;
  let events: PaymentEventsService;
  let bookings: BookingsService;
  let sent: MockEvent[];
  let alice: string;
  let bob: string;
  let buyer: string; // the fixture's buyer, who already has a confirmed booking

  const seatIds = async (showId: string, ...labels: string[]) => {
    const map = await f.shows.seatMap(showId, NOW);
    return labels.map((label) => map.seats.find((seat) => seat.label === label)!.id);
  };
  const states = async (showId: string, when: Date, ...labels: string[]) => {
    const map = await f.shows.seatMap(showId, when);
    return labels.map((label) => map.seats.find((seat) => seat.label === label)?.status);
  };
  const hold = async (userId: string, showId: string, labels: string[], when = NOW) =>
    holds.place(userId, { showId, seatIds: await seatIds(showId, ...labels) }, when);
  const refOf = (session: PaymentSession) =>
    decodeURIComponent(session.redirectUrl.split('/').pop()!);
  /** The gateway's last event, delivered to the webhook the way the sender would: signed. */
  const deliver = (event: MockEvent = sent[sent.length - 1], when = NOW) => {
    const body = JSON.stringify(event);
    return events.handleMockWebhook(Buffer.from(body), signMockEvent(SECRET, body, when), when);
  };
  const payment = (id: string) => f.dataSource.getRepository(Payment).findOneByOrFail({ id });
  const notices = (userId: string) =>
    f.dataSource
      .getRepository(Notification)
      .find({ where: { userId }, order: { createdAt: 'ASC' } });

  // The webhook logs every outcome; useful in the app, noise here.
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

  beforeEach(async () => {
    f = await createScheduleFixture();
    const repo = f.dataSource.getRepository.bind(f.dataSource);
    const provider = new MockPaymentProvider(f.config);
    sent = [];
    const sender = { send: (event: MockEvent) => sent.push(event) } as unknown as MockWebhookSender;
    holds = new HoldsService(f.lane, repo(Booking), f.config);
    checkout = new CheckoutService(f.lane, provider, f.config);
    events = new PaymentEventsService(f.lane, provider, f.config);
    gateway = new MockGatewayService(repo(Payment), provider, sender, f.config);
    bookings = new BookingsService(repo(Booking), f.config);

    const users = repo(User);
    alice = (await users.save({ email: 'alice@cineseat.dev', name: 'Alice', passwordHash: 'x' }))
      .id;
    bob = (await users.save({ email: 'bob@cineseat.dev', name: 'Bob', passwordHash: 'x' })).id;
    buyer = (await users.findOneByOrFail({ email: 'buyer@cineseat.dev' })).id;
    const from = new Date('2026-11-01T00:00:00Z');
    const to = new Date('2026-12-01T00:00:00Z');
    await repo(Coupon).insert([
      {
        code: 'WEEKEND10',
        type: 'PERCENT',
        value: 10,
        weekdays: '0,5,6',
        validFrom: from,
        validTo: to,
        description: '10% off weekend shows',
      },
      { code: 'FLAT100', type: 'FLAT', value: 10000, minSeats: 3, validFrom: from, validTo: to },
      {
        code: 'FIRST50',
        type: 'FLAT',
        value: 5000,
        firstBookingOnly: true,
        validFrom: from,
        validTo: to,
      },
      {
        code: 'OLD',
        type: 'FLAT',
        value: 5000,
        validFrom: from,
        validTo: new Date('2026-11-10T00:00:00Z'),
      },
      {
        code: 'GONE',
        type: 'FLAT',
        value: 5000,
        validFrom: from,
        validTo: to,
        usageLimit: 1,
        usedCount: 1,
      },
    ]);
  });

  afterEach(() => f.destroy());

  it('quotes the held seats, with or without an offer code', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1', 'B1', 'C1']);

    await expect(checkout.quote(alice, mine.id, {}, NOW)).resolves.toEqual({
      holdId: mine.id,
      expiresAt: at(5).toISOString(),
      currency: 'BDT',
      subtotal: 150000,
      discount: 0,
      total: 150000,
      coupon: null,
    });
    await expect(
      checkout.quote(alice, mine.id, { couponCode: 'WEEKEND10' }, NOW),
    ).resolves.toMatchObject({
      subtotal: 150000,
      discount: 15000,
      total: 135000,
      coupon: { code: 'WEEKEND10', description: '10% off weekend shows' },
    });
    await expect(
      checkout.quote(alice, mine.id, { couponCode: 'FLAT100' }, NOW),
    ).resolves.toMatchObject({
      total: 140000,
    });
    await expect(
      checkout.quote(alice, mine.id, { couponCode: 'FIRST50' }, NOW),
    ).resolves.toMatchObject({
      total: 145000,
    });
  });

  it('explains why an offer code does not apply', async () => {
    const why = (userId: string, holdId: string, code: string) =>
      checkout.quote(userId, holdId, { couponCode: code }, NOW).catch((e: Error) => e.message);
    const single = await hold(alice, f.ids.sat, ['A1']);
    const thursday = await hold(bob, f.ids.tonight, ['C3']);
    const returning = await hold(buyer, f.ids.sat, ['A4']);

    await expect(why(bob, thursday.id, 'WEEKEND10')).resolves.toBe(
      'couponCode: This code is for shows on Friday, Saturday and Sunday.',
    );
    await expect(why(alice, single.id, 'FLAT100')).resolves.toBe(
      'couponCode: This code needs at least 3 seats in one booking.',
    );
    await expect(why(buyer, returning.id, 'FIRST50')).resolves.toBe(
      'couponCode: This code is for your first booking only.',
    );
    await expect(why(alice, single.id, 'OLD')).resolves.toBe('couponCode: This code has expired.');
    await expect(why(alice, single.id, 'GONE')).resolves.toBe(
      'couponCode: This code has been fully redeemed.',
    );
    await expect(why(alice, single.id, 'NOPE')).resolves.toBe(
      'couponCode: There is no offer with the code NOPE.',
    );
    await expect(
      checkout.pay(alice, single.id, { couponCode: 'FLAT100' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens one payment per hold and extends the hold once, by the payment window', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1', 'A2']);

    const first = await checkout.pay(alice, mine.id, {}, at(4));
    expect(first).toMatchObject({
      bookingId: mine.id,
      provider: 'mock',
      status: 'PENDING',
      amount: 80000,
      currency: 'BDT',
      expiresAt: at(9).toISOString(), // four minutes in, five more to pay
    });
    expect(first.redirectUrl).toMatch(/^http:\/\/localhost:3000\/pay\/mock\/mock_[\w-]{24}$/);
    await expect(states(f.ids.sat, at(8.9), 'A1', 'A2')).resolves.toEqual(['HELD', 'HELD']);

    // A double click: the same payment, and the hold never grows past one window.
    const again = await checkout.pay(alice, mine.id, {}, at(6));
    expect(again.paymentId).toBe(first.paymentId);
    expect(again.expiresAt).toBe(at(10).toISOString());
    await expect(
      f.dataSource.getRepository(Payment).countBy({ bookingId: mine.id, status: 'PENDING' }),
    ).resolves.toBe(1);
    await expect(states(f.ids.sat, at(10), 'A1')).resolves.toEqual(['AVAILABLE']);
  });

  it('replaces the open payment when the offer code changes the price', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1', 'A2']);
    const plain = await checkout.pay(alice, mine.id, {}, NOW);
    const discounted = await checkout.pay(alice, mine.id, { couponCode: 'WEEKEND10' }, NOW);

    expect(discounted.paymentId).not.toBe(plain.paymentId);
    expect(discounted.amount).toBe(72000);
    await expect(payment(plain.paymentId)).resolves.toMatchObject({
      status: 'FAILED',
      failureReason: 'Replaced by a newer payment attempt.',
    });
  });

  it('confirms the booking when the test card pays: seats sold, offer counted, buyer told', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1', 'A2']);
    const session = await checkout.pay(alice, mine.id, { couponCode: 'WEEKEND10' }, NOW);
    const ref = refOf(session);

    await expect(gateway.session(ref, NOW)).resolves.toMatchObject({
      testMode: true,
      merchant: 'CineSeat',
      description: 'Midnight Express — 2 seats, Sat 14 Nov, 12:00 PM',
      amount: 72000,
      status: 'OPEN',
      returnUrl: `http://localhost:3000/checkout/${mine.id}?payment=${encodeURIComponent(ref)}`,
    });
    await expect(gateway.pay(ref, VISA_OK, NOW)).resolves.toEqual({
      status: 'SUCCEEDED',
      message: 'Payment approved.',
      returnUrl: `http://localhost:3000/checkout/${mine.id}?payment=${encodeURIComponent(ref)}`,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'payment.succeeded',
      data: { ref, amount: 72000, currency: 'BDT', method: 'Visa •••• 4242', reason: null },
    });
    expect(JSON.stringify(sent[0])).not.toContain('4242424242424242');

    await expect(deliver()).resolves.toEqual({ received: true, outcome: 'confirmed' });

    const booking = await bookings.findOne(alice, mine.id);
    expect(booking).toMatchObject({
      status: 'CONFIRMED',
      expiresAt: null,
      subtotal: 80000,
      discount: 8000,
      total: 72000,
      coupon: { code: 'WEEKEND10' },
      payment: { status: 'SUCCESS', amount: 72000, method: 'Visa •••• 4242' },
      show: { date: '2026-11-14', time: '12:00', movie: { title: 'Midnight Express' } },
    });
    expect(booking.code).toMatch(/^CS-[0-9A-F]{8}$/);
    expect(booking.seats.map((seat) => seat.label)).toEqual(['A1', 'A2']);
    await expect(states(f.ids.sat, at(30), 'A1', 'A2')).resolves.toEqual(['BOOKED', 'BOOKED']);
    await expect(
      f.dataSource.getRepository(Coupon).findOneByOrFail({ code: 'WEEKEND10' }),
    ).resolves.toMatchObject({
      usedCount: 1,
    });
    expect((await notices(alice)).map((n) => [n.type, n.body])).toEqual([
      [
        'BOOKING_CONFIRMED',
        'Midnight Express · Sat 14 Nov, 12:00 PM · CineSeat Bashundhara · seats A1, A2',
      ],
    ]);
    await expect(gateway.session(ref, NOW)).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(holds.current(alice, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(checkout.quote(alice, mine.id, {}, NOW)).rejects.toThrow('already paid');
    // Nothing sweeps a paid booking away.
    await holds.releaseExpired(at(60));
    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('applies each payment result once, however often it is delivered', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);
    const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW));
    await gateway.pay(ref, VISA_OK, NOW);
    const success = sent[0];

    await expect(deliver(success)).resolves.toMatchObject({ outcome: 'confirmed' });
    await expect(deliver(success)).resolves.toMatchObject({ outcome: 'duplicate' });
    await expect(
      deliver({
        ...success,
        id: 'evt_other',
        type: 'payment.failed',
        data: { ...success.data, reason: 'x' },
      }),
    ).resolves.toMatchObject({ outcome: 'duplicate' });
    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({
      status: 'CONFIRMED',
      payment: { status: 'SUCCESS' },
    });
    await expect(notices(alice)).resolves.toHaveLength(1);
  });

  it('keeps the hold after a declined card, so the buyer can pay again another way', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);
    const first = await checkout.pay(alice, mine.id, {}, NOW);
    await expect(gateway.pay(refOf(first), VISA_DECLINED, NOW)).resolves.toMatchObject({
      status: 'FAILED',
      message: 'Your card was declined.',
    });
    await expect(deliver()).resolves.toMatchObject({ outcome: 'failed' });

    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({
      status: 'PENDING',
      payment: {
        status: 'FAILED',
        failureReason: 'Your card was declined.',
        method: 'Visa •••• 0002',
      },
    });
    await expect(holds.current(alice, NOW)).resolves.toMatchObject({ id: mine.id });

    const second = await checkout.pay(alice, mine.id, {}, at(1));
    expect(second.paymentId).not.toBe(first.paymentId);
    await gateway.pay(
      refOf(second),
      { method: 'BKASH', wallet: '01712345678', otp: '123456' },
      at(1),
    );
    await expect(deliver(undefined, at(1))).resolves.toMatchObject({ outcome: 'confirmed' });
    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({
      status: 'CONFIRMED',
      payment: { status: 'SUCCESS', method: 'bKash 017•••••678' },
    });
  });

  it('refunds a second payment for a booking that is already paid', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);
    const stale = refOf(await checkout.pay(alice, mine.id, {}, NOW));
    await gateway.pay(stale, VISA_OK, NOW); // paid in another tab…
    const staleSuccess = sent[0];
    // …while this tab switched to an offer code and paid that too.
    const fresh = refOf(await checkout.pay(alice, mine.id, { couponCode: 'WEEKEND10' }, NOW));
    await gateway.pay(fresh, VISA_OK, NOW);
    await expect(deliver(sent[1])).resolves.toMatchObject({ outcome: 'confirmed' });

    await expect(deliver(staleSuccess)).resolves.toMatchObject({ outcome: 'refunded' });
    const payments = await f.dataSource
      .getRepository(Payment)
      .find({ where: { bookingId: mine.id }, order: { amount: 'DESC' } });
    expect(payments.map((p) => [p.amount, p.status, p.failureReason])).toEqual([
      [40000, 'REFUNDED', 'Refunded: this booking was already paid.'],
      [36000, 'SUCCESS', null],
    ]);
    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({
      status: 'CONFIRMED',
      total: 36000,
    });
    await expect(states(f.ids.sat, NOW, 'A1')).resolves.toEqual(['BOOKED']);
  });

  it('treats cancelling on the payment page as a failed attempt, keeping the hold', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);
    const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW));

    await expect(gateway.cancel(ref, NOW)).resolves.toMatchObject({
      status: 'FAILED',
      message: 'You cancelled the payment.',
    });
    await expect(deliver()).resolves.toMatchObject({ outcome: 'failed' });
    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({
      status: 'PENDING',
      payment: { status: 'FAILED', failureReason: 'You cancelled the payment.' },
    });
  });

  it('only takes test cards and codes, and answers each payment session once', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);
    const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW));
    const refusal = (input: Parameters<MockGatewayService['pay']>[1]) =>
      gateway.pay(ref, input, NOW).catch((e: Error) => e);

    const realCard = await refusal({ ...VISA_OK, cardNumber: '4111111111111111' });
    expect(realCard).toBeInstanceOf(BadRequestException);
    expect((realCard as Error).message).toBe(
      'cardNumber: This is a test gateway: use one of the test cards. Real cards are never charged.',
    );
    expect(await refusal({ ...VISA_OK, expiry: '10/26' })).toMatchObject({
      message: 'expiry: This card has expired.',
    });
    expect(await refusal({ method: 'NAGAD', wallet: '01812345678', otp: '111111' })).toMatchObject({
      message: 'otp: Wrong code. In test mode, 123456 approves and 000000 declines.',
    });
    expect(sent).toHaveLength(0); // refusals decide nothing

    await gateway.pay(ref, VISA_OK, NOW);
    await expect(gateway.pay(ref, VISA_OK, NOW)).rejects.toBeInstanceOf(ConflictException);
    await expect(gateway.cancel(ref, NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(sent).toHaveLength(1);
    await expect(gateway.session('mock_nope', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refunds money that arrives after the hold ended, leaving the seats with their new buyer', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1', 'A2']);
    const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW)); // hold now ends at +5
    await gateway.pay(ref, VISA_OK, at(4)); // approved, but the webhook is slow…

    // …and meanwhile the hold ran out and Bob took A1.
    await expect(gateway.session(ref, at(6))).resolves.toMatchObject({ status: 'COMPLETED' });
    const bobs = await hold(bob, f.ids.sat, ['A1'], at(6));
    await expect(deliver(undefined, at(7))).resolves.toMatchObject({ outcome: 'refunded' });

    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({
      status: 'FAILED',
      seats: [expect.objectContaining({ label: 'A1' }), expect.objectContaining({ label: 'A2' })],
      payment: {
        status: 'REFUNDED',
        failureReason: 'Refunded: the seat hold had ended before the payment arrived.',
      },
    });
    expect((await notices(alice)).map((n) => n.type)).toEqual(['BOOKING_FAILED', 'REFUNDED']);
    await expect(holds.current(bob, at(7))).resolves.toMatchObject({ id: bobs.id });
    await expect(states(f.ids.sat, at(7), 'A1', 'A2')).resolves.toEqual(['HELD', 'AVAILABLE']);
  });

  it('when a hold lapses: removed if nobody paid, kept as FAILED with its seats as history if they tried', async () => {
    const tried = await hold(alice, f.ids.sat, ['A1', 'A2']);
    await checkout.pay(alice, tried.id, {}, NOW); // payment opened, never finished
    const untouched = await hold(bob, f.ids.sat, ['B1']);

    await expect(holds.releaseExpired(at(5))).resolves.toBe(2);

    await expect(bookings.findOne(bob, untouched.id)).rejects.toBeInstanceOf(NotFoundException);
    const failed = await bookings.findOne(alice, tried.id);
    expect(failed).toMatchObject({
      status: 'FAILED',
      expiresAt: null,
      payment: {
        status: 'FAILED',
        failureReason: 'The seat hold ended before the payment was completed.',
      },
    });
    expect(failed.seats.map((seat) => seat.label)).toEqual(['A1', 'A2']);
    await expect(
      f.dataSource
        .getRepository(BookingSeat)
        .countBy({ bookingId: tried.id, releasedAt: Not(IsNull()) }),
    ).resolves.toBe(2);
    expect((await notices(alice)).map((n) => n.type)).toEqual(['BOOKING_FAILED']);
    // Released seats can be held again: one live booking per seat, history kept.
    await expect(hold(bob, f.ids.sat, ['A1', 'A2'], at(6))).resolves.toMatchObject({
      seats: [expect.objectContaining({ label: 'A1' }), expect.objectContaining({ label: 'A2' })],
    });
  });

  it('keeps failed attempts as history without locking the show for admins', async () => {
    const tried = await hold(alice, f.ids.sat, ['A1']);
    await checkout.pay(alice, tried.id, {}, NOW);
    await holds.releaseExpired(at(5)); // the hold ends mid-payment: FAILED, kept with its payment

    await expect(
      f.shows.update(f.ids.sat, { basePrice: 45000 }, null, at(6)),
    ).resolves.toMatchObject({
      priceFrom: 45000,
    });
    await expect(f.shows.remove(f.ids.sat, null, at(6))).rejects.toThrow(
      'This show has 1 booking attempt on record (payments that did not complete) and cannot be deleted.',
    );
  });

  it('turns away webhooks that are not from the gateway or do not match the payment', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);
    const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW));
    await gateway.pay(ref, VISA_OK, NOW);
    const event = sent[0];
    const body = JSON.stringify(event);

    const tampered = JSON.stringify({ ...event, data: { ...event.data, amount: 1 } });
    await expect(
      events.handleMockWebhook(Buffer.from(tampered), signMockEvent(SECRET, body, NOW), NOW),
    ).rejects.toThrow('Invalid webhook signature');
    await expect(
      events.handleMockWebhook(
        Buffer.from(body),
        signMockEvent('someone-elses-secret', body, NOW),
        NOW,
      ),
    ).rejects.toThrow('Invalid webhook signature');
    await expect(
      events.handleMockWebhook(Buffer.from(body), signMockEvent(SECRET, body, at(-10)), NOW),
    ).rejects.toThrow('Invalid webhook signature');
    await expect(events.handleMockWebhook(Buffer.from(body), undefined, NOW)).rejects.toThrow(
      'Invalid webhook signature',
    );
    await expect(deliver({ ...event, data: { ...event.data, amount: 1 } })).rejects.toThrow(
      'The event does not match the payment amount',
    );
    await expect(
      deliver({ ...event, data: { ...event.data, ref: 'mock_nope' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(bookings.findOne(alice, mine.id)).resolves.toMatchObject({ status: 'PENDING' });
  });

  it("works only on the buyer's own hold while it lasts", async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);

    await expect(checkout.quote(bob, mine.id, {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(checkout.pay(bob, mine.id, {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(bookings.findOne(bob, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(checkout.pay(alice, mine.id, {}, at(5))).rejects.toBeInstanceOf(GoneException);
  });

  it("lists the buyer's bookings, newest first", async () => {
    const first = await hold(alice, f.ids.sat, ['A1']);
    await gateway.pay(refOf(await checkout.pay(alice, first.id, {}, NOW)), VISA_OK, NOW);
    await deliver();
    const second = await hold(alice, f.ids.late, ['A1'], at(1));
    await checkout.pay(alice, second.id, {}, at(1));

    const page = await bookings.list(alice, { page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.id, item.status])).toEqual([
      [second.id, 'PENDING'],
      [first.id, 'CONFIRMED'],
    ]);
    await expect(
      bookings.list(alice, { page: 1, pageSize: 20, status: 'CONFIRMED' }),
    ).resolves.toMatchObject({
      total: 1,
    });
    await expect(bookings.list(bob, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      total: 0,
    });
  });
});
