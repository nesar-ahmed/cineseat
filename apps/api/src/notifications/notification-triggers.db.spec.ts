import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { PaymentSession } from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import { CheckoutService } from '../bookings/checkout.service';
import { Booking, Coupon, Notification, Payment, User } from '../database/entities';
import { sqlTime } from '../database/inventory-lane';
import { HoldExpiryJob } from '../holds/hold-expiry.job';
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
import { NotificationsJob } from './notifications.job';
import { NotificationsService } from './notifications.service';
import { notify } from './notify';
import { ScheduledNotifications } from './scheduled-notifications';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
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
/** The fixture's Saturday show: 12:00 on 14 Nov in Dhaka, a 3×4 hall (A ৳400, B ৳500, C ৳600). */
const SAT = new Date('2026-11-14T06:00:00.000Z');
const beforeSat = (hours: number) => new Date(SAT.getTime() - hours * HOUR);

/**
 * Where notifications come from, end to end on a real SQLite file: holds and the
 * sweep, the gateway and its webhook, the clock-driven jobs. The wall clock is
 * never read — every step gets its own `now`.
 */
describe('Notification triggers (SQLite)', () => {
  let f: ScheduleFixture;
  let holds: HoldsService;
  let checkout: CheckoutService;
  let gateway: MockGatewayService;
  let events: PaymentEventsService;
  let notifications: NotificationsService;
  let scheduled: ScheduledNotifications;
  let sent: MockEvent[];
  let admin: string;
  let alice: string;
  let bob: string;
  let carol: string;

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
  /** Hold → pay → approved card → webhook: a confirmed booking. */
  const buy = async (
    userId: string,
    labels: string[],
    options: { when?: Date; couponCode?: string } = {},
  ) => {
    const when = options.when ?? NOW;
    const mine = await hold(userId, f.ids.sat, labels, when);
    const session = await checkout.pay(userId, mine.id, { couponCode: options.couponCode }, when);
    await gateway.pay(refOf(session), VISA_OK, when);
    await expect(deliver(undefined, when)).resolves.toMatchObject({ outcome: 'confirmed' });
    return mine.id;
  };
  const notices = (userId: string) =>
    f.dataSource
      .getRepository(Notification)
      .find({ where: { userId }, order: { createdAt: 'ASC', type: 'ASC' } });
  const types = async (userId: string) => (await notices(userId)).map((n) => n.type);

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
    notifications = new NotificationsService(repo(Notification), f.lane);
    scheduled = new ScheduledNotifications(f.lane, f.config);

    const users = repo(User);
    const add = async (email: string, name: string, role = 'USER') =>
      (await users.save({ email, name, role, passwordHash: 'x' })).id;
    admin = await add('admin@cineseat.dev', 'Admin', 'ADMIN');
    alice = await add('alice@cineseat.dev', 'Alice');
    bob = await add('bob@cineseat.dev', 'Bob');
    carol = await add('carol@cineseat.dev', 'Carol');
    await repo(Coupon).insert({
      code: 'ONCE',
      type: 'FLAT',
      value: 5000,
      usageLimit: 1,
      validFrom: new Date('2026-11-01T00:00:00Z'),
      validTo: new Date('2026-12-01T00:00:00Z'),
    });
  });

  afterEach(() => f.destroy());

  describe('seat holds', () => {
    it('warns once when about two minutes are left, and again for the payment window', async () => {
      const mine = await hold(alice, f.ids.sat, ['A1', 'A2']); // ends at +5

      await expect(scheduled.warnExpiringHolds(at(2))).resolves.toBe(0); // 3 minutes left
      await expect(scheduled.warnExpiringHolds(at(3.5))).resolves.toBe(1);
      await expect(scheduled.warnExpiringHolds(at(3.6))).resolves.toBe(0); // already told
      expect((await notices(alice)).map((n) => [n.type, n.body, n.bookingId])).toEqual([
        [
          'HOLD_EXPIRING',
          'About 2 minutes left to pay for Midnight Express (seats A1, A2). Finish checkout by 12:05 PM to keep them.',
          mine.id,
        ],
      ]);

      // Starting to pay extends the hold once (to +9): that deadline gets its own warning.
      await checkout.pay(alice, mine.id, {}, at(4));
      await expect(scheduled.warnExpiringHolds(at(7.5))).resolves.toBe(1);
      expect((await notices(alice)).map((n) => n.body)[1]).toContain('Finish checkout by 12:09 PM');
    });

    it('tells the owner when an unpaid hold lapses, linking the show (the booking is gone)', async () => {
      const mine = await hold(bob, f.ids.sat, ['B1']);
      await scheduled.warnExpiringHolds(at(4));
      await holds.releaseExpired(at(6));

      const [warning, released] = await notices(bob);
      expect(released).toMatchObject({
        type: 'HOLD_EXPIRED',
        title: 'Your seats were released',
        body: "Checkout for Midnight Express (seats B1) wasn't finished in time, so the seats went back on sale. Pick seats again to book.",
        showId: f.ids.sat,
        bookingId: null,
      });
      // The warning outlives the deleted hold, unlinked (ON DELETE SET NULL).
      expect(warning).toMatchObject({ type: 'HOLD_EXPIRING', bookingId: null });
      await expect(f.dataSource.getRepository(Booking).existsBy({ id: mine.id })).resolves.toBe(
        false,
      );
    });

    it('says so when the hold ended because the show started', async () => {
      // 2 minutes before tonight's 19:00 show: the hold is cut at the start time.
      const start = new Date('2026-11-12T13:00:00.000Z');
      await hold(alice, f.ids.tonight, ['C3'], new Date(start.getTime() - 2 * MINUTE));
      await holds.releaseExpired(new Date(start.getTime() + MINUTE));

      expect((await notices(alice)).map((n) => [n.type, n.body])).toEqual([
        [
          'HOLD_EXPIRED',
          'Your hold on seats C3 for Midnight Express ended when the show started, before checkout was finished.',
        ],
      ]);
    });

    it('stays quiet when buyers release or replace their own hold', async () => {
      const first = await hold(alice, f.ids.sat, ['A1']);
      await hold(alice, f.ids.sat, ['A2'], at(1)); // replaces the first
      const second = await holds.current(alice, at(1));
      await holds.release(alice, second.id, at(2));

      await holds.releaseExpired(at(10));
      expect(first.id).not.toBe(second.id);
      await expect(notices(alice)).resolves.toEqual([]);
    });

    it('reports a lapse after a payment attempt as BOOKING_FAILED, linked to the kept booking', async () => {
      const mine = await hold(alice, f.ids.sat, ['A1']);
      await checkout.pay(alice, mine.id, {}, NOW); // never finished
      await holds.releaseExpired(at(6));

      expect((await notices(alice)).map((n) => [n.type, n.bookingId])).toEqual([
        ['BOOKING_FAILED', mine.id],
      ]);
    });
  });

  describe('payments', () => {
    it('tells the buyer a payment failed, and how long the seats stay held', async () => {
      const mine = await hold(alice, f.ids.sat, ['A1']);
      const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW)); // hold ends at +5
      await gateway.pay(ref, VISA_DECLINED, at(1));
      await expect(deliver(undefined, at(1))).resolves.toMatchObject({ outcome: 'failed' });
      await expect(deliver(undefined, at(1))).resolves.toMatchObject({ outcome: 'ignored' });

      expect((await notices(alice)).map((n) => [n.type, n.title, n.body, n.bookingId])).toEqual([
        [
          'PAYMENT_FAILED',
          'Payment not completed',
          'Your card was declined. Your seats for Midnight Express stay held until 12:05 PM — you can try again.',
          mine.id,
        ],
      ]);
      await expect(notices(admin)).resolves.toEqual([]);
    });

    it('does not promise a hold that has already run out', async () => {
      const mine = await hold(alice, f.ids.sat, ['A1']);
      const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW));
      await gateway.pay(ref, VISA_DECLINED, at(4));
      await deliver(undefined, at(6)); // the hold ended at +5; the sweep has not run yet

      expect((await notices(alice)).map((n) => n.body)).toEqual([
        'Your card was declined. The seat hold for Midnight Express has ended.',
      ]);
    });

    it('confirms with a link to the booking', async () => {
      const id = await buy(alice, ['A1', 'A2']);
      expect((await notices(alice)).map((n) => [n.type, n.body, n.bookingId])).toEqual([
        [
          'BOOKING_CONFIRMED',
          'Midnight Express · Sat 14 Nov, 12:00 PM · CineSeat Bashundhara · seats A1, A2',
          id,
        ],
      ]);
      await expect(notices(admin)).resolves.toEqual([]); // a single sale is no news
    });

    it('refunds late money: the buyer and every admin are told', async () => {
      const mine = await hold(alice, f.ids.sat, ['A1', 'A2']);
      const ref = refOf(await checkout.pay(alice, mine.id, {}, NOW));
      await gateway.pay(ref, VISA_OK, at(4)); // approved, but the webhook is slow…
      await holds.releaseExpired(at(6)); // …and the hold ends first
      await expect(deliver(undefined, at(7))).resolves.toMatchObject({ outcome: 'refunded' });

      const refund = (await notices(alice)).find((n) => n.type === 'REFUNDED');
      expect(refund).toMatchObject({
        body: 'The seat hold had ended before the payment arrived. The full amount for Midnight Express is on its way back to you.',
        bookingId: mine.id,
      });
      expect((await notices(admin)).map((n) => [n.type, n.title, n.body, n.bookingId])).toEqual([
        [
          'ADMIN_REFUND_ISSUED',
          'Refund issued: ৳800',
          `${bookingCode(mine.id)} · Midnight Express · alice@cineseat.dev. The seat hold had ended before the payment arrived.`,
          mine.id,
        ],
      ]);
    });

    it('tells admins when a show is almost full, then sold out — once each', async () => {
      await buy(alice, ['A1', 'A2', 'A3', 'A4', 'B1', 'B2']); // 6 of 12
      await expect(notices(admin)).resolves.toEqual([]);
      await buy(bob, ['B3', 'B4', 'C1', 'C2', 'C3']); // 11 of 12
      await buy(carol, ['C4']); // 12 of 12

      expect((await notices(admin)).map((n) => [n.type, n.title, n.body, n.showId])).toEqual([
        [
          'ADMIN_SHOW_ALMOST_FULL',
          'Almost full: Midnight Express',
          'Midnight Express · Sat 14 Nov, 12:00 PM · CineSeat Bashundhara, Screen 1 — 11 of 12 seats sold (91%).',
          f.ids.sat,
        ],
        [
          'ADMIN_SHOW_SOLD_OUT',
          'Sold out: Midnight Express',
          'Midnight Express · Sat 14 Nov, 12:00 PM · CineSeat Bashundhara, Screen 1 — all 12 seats sold.',
          f.ids.sat,
        ],
      ]);
    });

    it('tells admins when an offer reaches its usage limit', async () => {
      await buy(alice, ['A1'], { couponCode: 'ONCE' });
      expect((await notices(admin)).map((n) => [n.type, n.title, n.couponCode])).toEqual([
        ['ADMIN_COUPON_EXHAUSTED', 'Offer used up: ONCE', 'ONCE'],
      ]);
    });

    it('alerts admins to rejected webhooks, at most once per kind every 10 minutes', async () => {
      const forged = (when: Date) =>
        events.handleMockWebhook(Buffer.from('{"id":"x"}'), 'v1=forged', when);
      await expect(forged(NOW)).rejects.toBeInstanceOf(BadRequestException);
      await expect(forged(at(1))).rejects.toBeInstanceOf(BadRequestException);
      expect(await types(admin)).toEqual(['ADMIN_PAYMENT_ALERT']);

      // Correctly signed, but for a payment that was never opened: its own kind.
      const unknown: MockEvent = {
        id: 'evt_unknown',
        type: 'payment.succeeded',
        created: Math.floor(at(2).getTime() / 1000),
        data: {
          ref: 'mock_never_opened',
          amount: 100,
          currency: 'BDT',
          method: null,
          reason: null,
        },
      };
      await expect(deliver(unknown, at(2))).rejects.toBeInstanceOf(NotFoundException);
      await expect(forged(at(11))).rejects.toBeInstanceOf(BadRequestException); // next window

      const alerts = await notices(admin);
      expect(alerts.map((n) => n.body.split(' because ')[1].split('.')[0])).toEqual([
        'its signature did not verify',
        'it named a payment CineSeat never opened',
        'its signature did not verify',
      ]);
      await expect(notices(alice)).resolves.toEqual([]);
    });
  });

  describe('show reminders', () => {
    it('sends the day-before and two-hour reminders once each', async () => {
      const id = await buy(alice, ['A1', 'A2']); // booked two days ahead
      const reminders = async () =>
        (await notices(alice)).filter((n) => n.type === 'SHOW_REMINDER').map((n) => n.title);

      await scheduled.remindUpcomingShows(beforeSat(30));
      expect(await reminders()).toEqual([]);
      await scheduled.remindUpcomingShows(beforeSat(23));
      await scheduled.remindUpcomingShows(beforeSat(22));
      expect(await reminders()).toEqual(['Your show is coming up: Midnight Express']);
      await scheduled.remindUpcomingShows(beforeSat(1.5));
      await scheduled.remindUpcomingShows(beforeSat(1));
      expect(await reminders()).toEqual([
        'Your show is coming up: Midnight Express',
        'Midnight Express starts soon',
      ]);
      expect((await notices(alice)).at(-1)).toMatchObject({
        body: `Sat 14 Nov, 12:00 PM · CineSeat Bashundhara, Screen 1 · seats A1, A2. Arrive 15 minutes early and show booking code ${bookingCode(id)} at the entrance.`,
        bookingId: id,
      });
    });

    it('skips a reminder whose time passed before the booking was made', async () => {
      await buy(bob, ['C1'], { when: beforeSat(3) }); // booked 3 hours ahead
      await scheduled.remindUpcomingShows(beforeSat(2.5));
      await scheduled.remindUpcomingShows(beforeSat(1));
      expect(
        (await notices(bob)).filter((n) => n.type === 'SHOW_REMINDER').map((n) => n.title),
      ).toEqual(['Midnight Express starts soon']);
    });

    it('sends only the 2-hour one when the job was down through the day-before window', async () => {
      await buy(alice, ['A1']);
      await scheduled.remindUpcomingShows(beforeSat(1));
      expect(
        (await notices(alice)).filter((n) => n.type === 'SHOW_REMINDER').map((n) => n.title),
      ).toEqual(['Midnight Express starts soon']);
    });
  });

  describe('housekeeping', () => {
    it('removes notifications read more than 90 days ago, keeping unread ones', async () => {
      const day = 24 * HOUR;
      const old = new Date(NOW.getTime() - 120 * day);
      await f.lane.run((tx) => {
        for (const title of ['old read', 'old unread', 'recent read']) {
          notify(tx, old, { userId: alice, type: 'ANNOUNCEMENT', title, body: title });
        }
        tx.run(
          `UPDATE "notifications" SET "readAt" = ? WHERE "title" = 'old read'`,
          sqlTime(new Date(NOW.getTime() - 91 * day)),
        );
        tx.run(
          `UPDATE "notifications" SET "readAt" = ? WHERE "title" = 'recent read'`,
          sqlTime(new Date(NOW.getTime() - 10 * day)),
        );
      });

      await expect(scheduled.purgeOldRead(NOW)).resolves.toBe(1);
      expect((await notices(alice)).map((n) => n.title).sort()).toEqual([
        'old unread',
        'recent read',
      ]);
    });

    it('alerts admins when a background job fails', async () => {
      const broken = {
        warnExpiringHolds: () => Promise.reject(new Error('database is locked')),
      } as unknown as ScheduledNotifications;
      await new NotificationsJob(broken, notifications).holdWarnings();

      const failingHolds = {
        releaseExpired: () => Promise.reject(new Error('disk I/O error')),
      } as unknown as HoldsService;
      await new HoldExpiryJob(failingHolds, notifications).sweep();

      expect((await notices(admin)).map((n) => [n.type, n.title]).sort()).toEqual([
        ['ADMIN_SYSTEM_ALERT', 'Background job failed: hold warnings'],
        ['ADMIN_SYSTEM_ALERT', 'Background job failed: seat-hold cleanup'],
      ]);
      expect((await notices(admin))[0].body).toMatch(/It runs again automatically/);
    });
  });
});
