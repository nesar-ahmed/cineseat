import { Logger, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { InvoiceSeller, PaymentSession } from '@cineseat/shared';
import { Booking, Coupon, Payment, User } from '../database/entities';
import { HoldsService } from '../holds/holds.service';
import { MockGatewayService } from '../mock-gateway/mock-gateway.service';
import type { MockWebhookSender } from '../mock-gateway/mock-webhook.sender';
import type { MockEvent } from '../payments/mock-event';
import { MockPaymentProvider } from '../payments/mock-payment-provider';
import { signMockEvent } from '../payments/mock-signature';
import { PaymentEventsService } from '../payments/payment-events.service';
import { CheckoutService } from '../bookings/checkout.service';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../shows/testing/schedule-fixture';
import { InvoicesService } from './invoices.service';

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
const SELLER: InvoiceSeller = {
  name: 'CineSeat Entertainment Ltd.',
  addressLines: ['Level 4, 12 Gulshan Avenue'],
  city: 'Dhaka 1212',
  country: 'Bangladesh',
  email: 'billing@cineseat.dev',
  website: 'cineseat.dev',
};

/**
 * Invoices against a real SQLite file, billed from bookings paid the way the
 * app pays them: hold → checkout → the test gateway → its signed webhook.
 * "sat" is a Saturday show in an empty 3×4 hall (row A ৳400, B ৳500, C ৳600).
 */
describe('InvoicesService (SQLite)', () => {
  let f: ScheduleFixture;
  let holds: HoldsService;
  let checkout: CheckoutService;
  let gateway: MockGatewayService;
  let events: PaymentEventsService;
  let invoices: InvoicesService;
  let sent: MockEvent[];
  let alice: string;
  let bob: string;

  const seatIds = async (showId: string, ...labels: string[]) => {
    const map = await f.shows.seatMap(showId, NOW);
    return labels.map((label) => map.seats.find((seat) => seat.label === label)!.id);
  };
  const hold = async (userId: string, showId: string, labels: string[], when = NOW) =>
    holds.place(userId, { showId, seatIds: await seatIds(showId, ...labels) }, when);
  const refOf = (session: PaymentSession) =>
    decodeURIComponent(session.redirectUrl.split('/').pop()!);
  const deliver = (event: MockEvent = sent[sent.length - 1], when = NOW) => {
    const body = JSON.stringify(event);
    return events.handleMockWebhook(Buffer.from(body), signMockEvent(SECRET, body, when), when);
  };
  /** Books seats and pays for them, the whole way through. Returns the booking id. */
  const buy = async (
    userId: string,
    labels: string[],
    options: { couponCode?: string; when?: Date } = {},
  ) => {
    const when = options.when ?? NOW;
    const booking = await hold(userId, f.ids.sat, labels, when);
    const ref = refOf(
      await checkout.pay(
        userId,
        booking.id,
        options.couponCode ? { couponCode: options.couponCode } : {},
        when,
      ),
    );
    await gateway.pay(ref, VISA_OK, when);
    await deliver(sent[sent.length - 1], when);
    return booking.id;
  };

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
    // The fixture's config knows nothing of invoices; everything else comes from it.
    const config = {
      getOrThrow: (key: string) =>
        key === 'invoiceSeller' ? SELLER : f.config.getOrThrow<unknown>(key),
      get: (key: string) => (key === 'paymentProvider' ? 'mock' : f.config.get<unknown>(key)),
    } as unknown as ConfigService;
    invoices = new InvoicesService(repo(Booking), config);

    const users = repo(User);
    alice = (
      await users.save({
        email: 'alice@cineseat.dev',
        name: 'Alice Rahman',
        phone: '01700000001',
        passwordHash: 'x',
      })
    ).id;
    bob = (await users.save({ email: 'bob@cineseat.dev', name: 'Bob', passwordHash: 'x' })).id;
    await repo(Coupon).insert({
      code: 'WEEKEND10',
      type: 'PERCENT',
      value: 10,
      weekdays: '0,5,6',
      validFrom: new Date('2026-11-01T00:00:00Z'),
      validTo: new Date('2026-12-01T00:00:00Z'),
      description: '10% off weekend shows',
    });
  });

  afterEach(() => f.destroy());

  it('bills a paid booking: a line per seat category, the offer, and who paid what', async () => {
    const id = await buy(alice, ['A1', 'B1', 'C1'], { couponCode: 'WEEKEND10' });

    const invoice = await invoices.findOne(alice, id);
    expect(invoice).toMatchObject({
      id,
      bookingId: id,
      status: 'PAID',
      bookingStatus: 'CONFIRMED',
      currency: 'BDT',
      subtotal: 150000, // ৳400 + ৳500 + ৳600, in poisha
      discount: 15000,
      total: 135000,
      amountPaid: 135000,
      amountRefunded: 0,
      seatCount: 3,
      paymentMethod: 'Visa •••• 4242',
      seller: SELLER,
      buyer: { name: 'Alice Rahman', email: 'alice@cineseat.dev', phone: '01700000001' },
      coupon: { code: 'WEEKEND10', description: '10% off weekend shows' },
      refunds: [],
      payment: { provider: 'mock', status: 'SUCCESS', method: 'Visa •••• 4242' },
    });
    // The number is stable and readable: the settlement year and the booking code.
    expect(invoice.number).toBe(`INV-2026-${invoice.bookingCode.replace('CS-', '')}`);
    expect(invoice.bookingCode).toMatch(/^CS-[0-9A-F]{8}$/);
    expect(invoice.issuedAt).toBe(invoice.payment.paidAt);
    expect(invoice.lines).toEqual([
      {
        description: 'Standard seat',
        category: 'STANDARD',
        seats: ['A1'],
        quantity: 1,
        unitPrice: 40000,
        amount: 40000,
      },
      {
        description: 'Premium seat',
        category: 'PREMIUM',
        seats: ['B1'],
        quantity: 1,
        unitPrice: 50000,
        amount: 50000,
      },
      {
        description: 'Recliner seat',
        category: 'RECLINER',
        seats: ['C1'],
        quantity: 1,
        unitPrice: 60000,
        amount: 60000,
      },
    ]);
    expect(invoice.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(invoice.subtotal);
    expect(invoice.show).toMatchObject({
      movie: { title: 'Midnight Express' },
      screen: { name: 'Screen 1' },
    });
    expect(invoice.notes).toContain(
      'Test mode: payments are simulated and no money changed hands.',
    );
  });

  it('puts seats of one category and price on a single line, in row order', async () => {
    const id = await buy(alice, ['A3', 'A1', 'B2', 'B1']);

    const invoice = await invoices.findOne(alice, id);
    expect(invoice.lines).toEqual([
      {
        description: 'Standard seat',
        category: 'STANDARD',
        seats: ['A1', 'A3'],
        quantity: 2,
        unitPrice: 40000,
        amount: 80000,
      },
      {
        description: 'Premium seat',
        category: 'PREMIUM',
        seats: ['B1', 'B2'],
        quantity: 2,
        unitPrice: 50000,
        amount: 100000,
      },
    ]);
    expect(invoice).toMatchObject({ subtotal: 180000, discount: 0, total: 180000, seatCount: 4 });
  });

  it('bills money that arrived after the hold ended as refunded, not paid', async () => {
    const booking = await hold(alice, f.ids.sat, ['A1', 'A2']);
    const ref = refOf(await checkout.pay(alice, booking.id, {}, NOW)); // hold now ends at +5
    await gateway.pay(ref, VISA_OK, at(4)); // approved, but the webhook is slow…
    await hold(bob, f.ids.sat, ['A1'], at(6)); // …and A1 went to Bob meanwhile
    await expect(deliver(undefined, at(7))).resolves.toMatchObject({ outcome: 'refunded' });

    const invoice = await invoices.findOne(alice, booking.id);
    expect(invoice).toMatchObject({
      status: 'REFUNDED',
      bookingStatus: 'FAILED',
      total: 80000,
      amountPaid: 0,
      amountRefunded: 80000,
      payment: { status: 'REFUNDED' },
    });
    expect(invoice.refunds).toEqual([
      {
        amount: 80000,
        reason: 'Refunded: the seat hold had ended before the payment arrived.',
        refundedAt: at(7).toISOString(),
      },
    ]);
    expect(invoice.notes).toContain(
      'This payment arrived after the seat hold ended, so it was refunded in full.',
    );
  });

  it('stays paid when a second payment for the same booking was refunded', async () => {
    const booking = await hold(alice, f.ids.sat, ['A1']);
    const stale = refOf(await checkout.pay(alice, booking.id, {}, NOW));
    await gateway.pay(stale, VISA_OK, NOW); // paid in another tab…
    const staleSuccess = sent[0];
    const fresh = refOf(await checkout.pay(alice, booking.id, { couponCode: 'WEEKEND10' }, NOW));
    await gateway.pay(fresh, VISA_OK, NOW);
    await deliver(sent[1]); // …this one confirms the booking
    await deliver(staleSuccess); // …and the first is refunded

    const invoice = await invoices.findOne(alice, booking.id);
    expect(invoice).toMatchObject({
      status: 'PAID',
      total: 36000, // the offer price the booking was confirmed at
      amountPaid: 36000,
      amountRefunded: 40000,
      payment: { status: 'SUCCESS' },
    });
    expect(invoice.refunds).toHaveLength(1);
    expect(invoice.notes).toContain(
      'A further payment for this booking was received and refunded in full.',
    );
  });

  it('has no invoice until money moves, and none for somebody else', async () => {
    const unpaid = await hold(alice, f.ids.sat, ['A1']);
    await expect(invoices.findOne(alice, unpaid.id)).rejects.toThrow(NotFoundException);

    // An open payment is not money moved either.
    await checkout.pay(alice, unpaid.id, {}, NOW);
    await expect(invoices.findOne(alice, unpaid.id)).rejects.toThrow(NotFoundException);
    await expect(invoices.list(alice, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [],
      total: 0,
    });

    const paid = await buy(bob, ['B1']);
    // Another buyer's invoice is not found rather than forbidden: its existence is not his business.
    await expect(invoices.findOne(alice, paid)).rejects.toThrow(NotFoundException);
    await expect(invoices.findOne(alice, 'no-such-booking')).rejects.toThrow(NotFoundException);
  });

  it('lists the buyer’s invoices, newest settlement first, paged and filtered by status', async () => {
    const first = await buy(alice, ['A1'], { when: NOW });
    const second = await buy(alice, ['B1'], { when: at(10) });
    await buy(bob, ['C1'], { when: at(12) }); // somebody else's

    // A late payment of Alice's, refunded: an invoice too, settled last.
    const late = await hold(alice, f.ids.sat, ['A2', 'A3'], at(20));
    const ref = refOf(await checkout.pay(alice, late.id, {}, at(20)));
    await gateway.pay(ref, VISA_OK, at(21));
    // The hold lapses and A2 goes to somebody else, so the late money can only go back.
    await hold(bob, f.ids.sat, ['A2'], at(26));
    await deliver(undefined, at(30));

    const page = await invoices.list(alice, { page: 1, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items.map((invoice) => invoice.id)).toEqual([late.id, second]);
    expect(page.items[0]).toMatchObject({
      status: 'REFUNDED',
      movieTitle: 'Midnight Express',
      theaterName: 'CineSeat Bashundhara',
      seatCount: 2,
    });

    const rest = await invoices.list(alice, { page: 2, pageSize: 2 });
    expect(rest.items.map((invoice) => invoice.id)).toEqual([first]);

    const paid = await invoices.list(alice, { page: 1, pageSize: 20, status: 'PAID' });
    expect(paid.items.map((invoice) => invoice.id)).toEqual([second, first]);
    const refunded = await invoices.list(alice, { page: 1, pageSize: 20, status: 'REFUNDED' });
    expect(refunded.items.map((invoice) => invoice.id)).toEqual([late.id]);
  });
});
