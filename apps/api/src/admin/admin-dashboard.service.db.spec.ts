import { Logger } from '@nestjs/common';
import type { PaymentSession } from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import { CheckoutService } from '../bookings/checkout.service';
import { Booking, Payment, User } from '../database/entities';
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
import { AdminDashboardService } from './admin-dashboard.service';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const SECRET = 'test-only-mock-payment-secret';
const VISA_OK = {
  method: 'CARD',
  cardNumber: '4242424242424242',
  expiry: '12/30',
  cvc: '123',
  name: 'Buyer',
} as const;

/**
 * The dashboard on a real SQLite file, with every sale placed in time: the
 * fixture's clock is 12:00 on 12 Nov 2026 in Dhaka. Shows: "early" (10:00 today,
 * started), "tonight" (19:00, 10 of 12 sold, one live hold on a seat), "late"
 * (01:30 on the 13th, 6 seats) and "sat" (14 Nov, 12 seats: A ৳400, B ৳500, C ৳600).
 */
describe('AdminDashboardService (SQLite)', () => {
  let f: ScheduleFixture;
  let holds: HoldsService;
  let checkout: CheckoutService;
  let gateway: MockGatewayService;
  let events: PaymentEventsService;
  let service: AdminDashboardService;
  let sent: MockEvent[];
  const ids: Record<string, string> = {};

  const seatIds = async (showId: string, labels: string[]) => {
    const map = await f.shows.seatMap(showId, NOW);
    return labels.map((label) => map.seats.find((seat) => seat.label === label)!.id);
  };
  const refOf = (session: PaymentSession) =>
    decodeURIComponent(session.redirectUrl.split('/').pop()!);
  const deliver = (when: Date) => {
    const body = JSON.stringify(sent[sent.length - 1]);
    return events.handleMockWebhook(Buffer.from(body), signMockEvent(SECRET, body, when), when);
  };
  /** A paid booking, made (and paid) at `when`. */
  const buy = async (userId: string, labels: string[], when: Date) => {
    const hold = await holds.place(
      userId,
      { showId: f.ids.sat, seatIds: await seatIds(f.ids.sat, labels) },
      when,
    );
    const session = await checkout.pay(userId, hold.id, {}, when);
    await gateway.pay(refOf(session), VISA_OK, when);
    await deliver(when);
    return hold.id;
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
    service = new AdminDashboardService(f.dataSource, f.config);

    const users = repo(User);
    for (const [name, role] of [
      ['alice', 'USER'],
      ['bob', 'USER'],
      ['carol', 'USER'],
      ['admin', 'ADMIN'],
    ] as const) {
      ids[name] = (
        await users.save({ email: `${name}@cineseat.dev`, name, role, passwordHash: 'x' })
      ).id;
    }
    // Sign-up times are pinned: everyone joined long ago except Alice (yesterday) and Bob (9 days ago).
    await users
      .createQueryBuilder()
      .update()
      .set({ createdAt: daysAgo(60) })
      .execute();
    await users.update({ id: ids.alice }, { createdAt: daysAgo(1) });
    await users.update({ id: ids.bob }, { createdAt: daysAgo(9) });
  });

  afterEach(() => f.destroy());

  it('compares the last 7 days with the 7 before, and counts only successful payments', async () => {
    const recent = await buy(ids.alice, ['A1', 'A2'], daysAgo(2)); // ৳800, 2 tickets
    const older = await buy(ids.bob, ['B1'], daysAgo(10)); // ৳500, 1 ticket
    await buy(ids.bob, ['C1'], daysAgo(20)); // outside both windows

    const { kpis } = await service.dashboard(NOW);
    expect(kpis.revenue).toEqual({ current: 80000, previous: 50000 });
    expect(kpis.ticketsSold).toEqual({ current: 2, previous: 1 });
    expect(kpis.bookings).toEqual({ current: 1, previous: 1 });
    expect(kpis.newUsers).toEqual({ current: 1, previous: 1 });
    expect(kpis.totalUsers).toBe(4); // the fixture's buyer, Alice, Bob, Carol — not the admin
    expect(recent).not.toBe(older);
  });

  it('reports occupancy of the coming week, live holds, refunds and today’s shows', async () => {
    await buy(ids.alice, ['A1', 'A2'], daysAgo(1));
    // Carol holds a seat now (a live hold)…
    await holds.place(
      ids.carol,
      { showId: f.ids.sat, seatIds: await seatIds(f.ids.sat, ['C4']) },
      NOW,
    );
    // …and Bob's money arrives after his hold had ended: refunded, not revenue.
    const late = await holds.place(
      ids.bob,
      { showId: f.ids.sat, seatIds: await seatIds(f.ids.sat, ['B4']) },
      daysAgo(3),
    );
    const session = await checkout.pay(ids.bob, late.id, {}, daysAgo(3));
    await gateway.pay(refOf(session), VISA_OK, daysAgo(3));
    await holds.releaseExpired(new Date(daysAgo(3).getTime() + 11 * MINUTE));
    await deliver(new Date(daysAgo(3).getTime() + 12 * MINUTE));

    const { kpis } = await service.dashboard(NOW);
    expect(kpis.revenue.current).toBe(80000);
    expect(kpis.refunds).toEqual({ count: 1, amount: 50000 });
    expect(kpis.activeHolds).toBe(1);
    // tonight 12 + late 6 + sat 12 seats; sold: tonight's 10 and Alice's 2 (the early show has started).
    expect(kpis.occupancy).toEqual({ sold: 12, capacity: 30 });
    expect(kpis.showsToday).toBe(2); // early (10:00) and tonight (19:00); late is 01:30 tomorrow
  });

  it('charts 14 cinema days, today last, bucketed on the Dhaka clock', async () => {
    // 23:30 in Dhaka two days ago is still that day there (17:30 UTC).
    await buy(ids.alice, ['A1'], new Date('2026-11-10T17:30:00.000Z'));
    await buy(ids.bob, ['B1', 'B2'], new Date('2026-11-10T18:30:00.000Z')); // 00:30 on the 11th in Dhaka

    const { salesByDay, today } = await service.dashboard(NOW);
    expect(today).toBe('2026-11-12');
    expect(salesByDay).toHaveLength(14);
    expect(salesByDay[0].date).toBe('2026-10-30');
    expect(salesByDay.at(-1)!.date).toBe('2026-11-12');
    const day = (date: string) => salesByDay.find((d) => d.date === date);
    expect(day('2026-11-10')).toEqual({ date: '2026-11-10', revenue: 40000, tickets: 1 });
    expect(day('2026-11-11')).toEqual({ date: '2026-11-11', revenue: 100000, tickets: 2 });
    expect(salesByDay.reduce((sum, d) => sum + d.revenue, 0)).toBe(140000);
  });

  it('lists the next shows with sold and held seats, the latest sales and the best sellers', async () => {
    const first = await buy(ids.alice, ['A1', 'A2'], daysAgo(2));
    const second = await buy(ids.bob, ['C1'], daysAgo(1));

    const { upcomingShows, recentBookings, topMovies } = await service.dashboard(NOW);
    expect(upcomingShows.map((s) => [s.id, s.sold, s.held, s.capacity])).toEqual([
      [f.ids.tonight, 10, 1, 12], // the fixture's live hold
      [f.ids.late, 0, 0, 6],
      [f.ids.sat, 3, 0, 12],
    ]);
    expect(upcomingShows[0]).toMatchObject({
      movieTitle: 'Midnight Express',
      theater: 'CineSeat Bashundhara',
      screen: 'Screen 1',
      startsAt: '2026-11-12T13:00:00.000Z',
      format: '3D',
    });
    expect(recentBookings).toEqual([
      {
        id: second,
        code: bookingCode(second),
        buyerName: 'bob',
        buyerEmail: 'bob@cineseat.dev',
        movieTitle: 'Midnight Express',
        seats: 1,
        amount: 60000,
        paidAt: daysAgo(1).toISOString(),
      },
      expect.objectContaining({ id: first, seats: 2, amount: 80000 }),
    ]);
    expect(topMovies).toEqual([
      { id: f.ids.m1, title: 'Midnight Express', tickets: 3, revenue: 140000 },
    ]);
  });

  it('is all zeros on an empty week, with the chart still complete', async () => {
    const dashboard = await service.dashboard(NOW);
    expect(dashboard.kpis.revenue).toEqual({ current: 0, previous: 0 });
    expect(dashboard.kpis.refunds).toEqual({ count: 0, amount: 0 });
    expect(dashboard.salesByDay.every((d) => d.revenue === 0 && d.tickets === 0)).toBe(true);
    expect(dashboard.recentBookings).toEqual([]);
    expect(dashboard.topMovies).toEqual([]);
    expect(dashboard.currency).toBe('BDT');
  });
});
