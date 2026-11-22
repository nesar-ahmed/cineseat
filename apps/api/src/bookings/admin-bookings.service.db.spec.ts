import { Logger, NotFoundException } from '@nestjs/common';
import { AdminBookingListQuerySchema, type AdminBookingList } from '@cineseat/shared';
import { AdminBookingsService } from './admin-bookings.service';
import { bookingCode } from './bookings.service';
import {
  createCheckoutFlowFixture,
  type BuyerName,
  type CheckoutFlowFixture,
} from './testing/checkout-flow-fixture';

/**
 * The admin bookings read model, on bookings made through the real flow (hold →
 * checkout → mock gateway → signed webhook), on the schedule fixture's Saturday
 * show (seats A ৳400, B ৳500, C ৳600). Clock: 12:00 on 12 Nov 2026 in Dhaka.
 *
 *   alice  A1 A2     paid at once                      CONFIRMED · 1 SUCCESS
 *   bob    B1        declined, then paid               CONFIRMED · FAILED + SUCCESS
 *   carol  C1 C2 C3  FLAT100 offer, holding, unpaid    PENDING   · no payment
 *   dave   A4        paid after his hold had ended     FAILED    · REFUNDED ৳400
 *   buyer  10 seats  the fixture's booking for tonight CONFIRMED · no payment
 */
describe('AdminBookingsService (SQLite)', () => {
  let f: CheckoutFlowFixture;
  let service: AdminBookingsService;
  let users: Record<BuyerName, string>;
  let ids: Record<BuyerName, string>;

  const list = (input: Record<string, unknown> = {}) =>
    service.list(AdminBookingListQuerySchema.parse(input));
  const codes = (page: AdminBookingList) => page.items.map((item) => item.buyer.name);

  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

  beforeEach(async () => {
    f = await createCheckoutFlowFixture();
    service = new AdminBookingsService(f.dataSource, f.config);
    users = f.users;
    ids = f.bookings;
  });

  afterEach(() => f.destroy());

  describe('list', () => {
    it('lists every buyer’s bookings, newest first, with money and the latest payment', async () => {
      const page = await list();
      expect(codes(page)).toEqual(['Carol', 'Dave', 'Bob', 'Alice', 'Buyer']);
      expect(page.counts).toEqual({ all: 5, PENDING: 1, CONFIRMED: 3, FAILED: 1, CANCELLED: 0 });
      // Seats still theirs: Carol 3 (held) + Bob 1 + Alice 2 + the fixture's 10; Dave's went back.
      expect(page.totals).toEqual({ seats: 16, paid: 130000, refunded: 40000 });

      const bob = page.items.find((item) => item.id === ids.bob)!;
      expect(bob).toMatchObject({
        code: bookingCode(ids.bob),
        status: 'CONFIRMED',
        expiresAt: null,
        buyer: { id: users.bob, name: 'Bob', email: 'bob@cineseat.dev' },
        show: {
          id: f.ids.sat,
          date: '2026-11-14',
          time: '12:00',
          format: '2D',
          movie: { title: 'Midnight Express' },
          theater: { name: 'CineSeat Bashundhara', city: 'Dhaka' },
          screen: { name: 'Screen 1' },
        },
        seats: ['B1'],
        total: 50000,
        discount: 0,
        paid: 50000,
        refunded: 0,
        payment: { status: 'SUCCESS', method: 'Visa •••• 4242', attempts: 2 },
      });
      const dave = page.items.find((item) => item.id === ids.dave)!;
      // A hold that ended shows the seats it held; the money went back.
      expect(dave).toMatchObject({
        status: 'FAILED',
        seats: ['A4'],
        paid: 0,
        refunded: 40000,
        payment: { status: 'REFUNDED', attempts: 1 },
      });
      const carol = page.items.find((item) => item.id === ids.carol)!;
      expect(carol).toMatchObject({
        status: 'PENDING',
        seats: ['C1', 'C2', 'C3'],
        total: 170000,
        discount: 10000,
        couponCode: 'FLAT100',
        payment: null,
      });
      expect(carol.expiresAt).not.toBeNull();
    });

    it('finds a booking by code (with or without CS-), buyer, email or movie', async () => {
      const code = bookingCode(ids.bob);
      expect(codes(await list({ search: code }))).toEqual(['Bob']);
      expect(codes(await list({ search: code.slice(3, 9).toLowerCase() }))).toEqual(['Bob']);
      expect(codes(await list({ search: 'DAVE@' }))).toEqual(['Dave']);
      expect((await list({ search: 'midnight' })).total).toBe(5);
      expect((await list({ search: 'paper boats' })).total).toBe(0);
      expect(codes(await list({ search: ids.alice }))).toEqual(['Alice']);
    });

    it('filters by status, payment outcome, offer, buyer, show and days', async () => {
      expect(codes(await list({ status: 'PENDING,FAILED' }))).toEqual(['Carol', 'Dave']);
      expect(codes(await list({ payment: 'REFUNDED' }))).toEqual(['Dave']);
      // Bob's declined attempt counts, though he paid in the end.
      expect(codes(await list({ payment: 'FAILED' }))).toEqual(['Bob']);
      expect(codes(await list({ coupon: 'flat100' }))).toEqual(['Carol']);
      expect(codes(await list({ user: users.alice }))).toEqual(['Alice']);
      expect(codes(await list({ show: f.ids.tonight }))).toEqual(['Buyer']);
      expect((await list({ showFrom: '2026-11-13' })).total).toBe(4);
      expect((await list({ showTo: '2026-11-12' })).total).toBe(1);
      expect((await list({ bookedFrom: '2030-01-01' })).total).toBe(0);
    });

    it('keeps the tabs counting with every other filter applied', async () => {
      const paid = await list({ status: 'CONFIRMED', search: 'a' });
      // "a" matches the names and e-mails of Alice, Carol, Dave — and the movie title, so everyone.
      expect(paid.total).toBe(3);
      expect(paid.counts.all).toBe(5);
      const refunds = await list({ payment: 'REFUNDED', status: 'CONFIRMED' });
      expect(refunds.items).toEqual([]);
      expect(refunds.counts).toMatchObject({ all: 1, FAILED: 1 });
    });

    it('sorts by amount, seats and show time, both ways', async () => {
      expect(codes(await list({ sort: 'amount' }))[0]).toBe('Carol');
      expect(codes(await list({ sort: 'seats' }))[0]).toBe('Buyer');
      expect(codes(await list({ sort: 'showtime', order: 'asc' }))[0]).toBe('Buyer');
      expect(codes(await list({ order: 'asc' }))[0]).toBe('Buyer');
    });

    it('pages without overlap', async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => list({ page, pageSize: 2 })));
      expect(pages.map((page) => page.items.length)).toEqual([2, 2, 1]);
      expect(new Set(pages.flatMap(codes)).size).toBe(5);
    });
  });

  describe('detail', () => {
    it('has every payment attempt, newest first, with the outcome and the buyer’s history', async () => {
      const bob = await service.detail(ids.bob);
      expect(bob.payments.map((payment) => payment.status)).toEqual(['SUCCESS', 'FAILED']);
      expect(bob.payments[1]).toMatchObject({
        provider: 'mock',
        amount: 50000,
        method: 'Visa •••• 0002',
        failureReason: expect.stringMatching(/declined/i),
      });
      expect(bob.payments[0].providerRef).toMatch(/\S+/);
      expect(bob.buyer).toMatchObject({
        name: 'Bob',
        phone: null,
        paidBookings: 1,
        spent: 50000,
      });
      expect(bob.seats).toEqual([
        { label: 'B1', category: 'PREMIUM', price: 50000, released: false },
      ]);
      expect(bob.subtotal).toBe(50000);
    });

    it('shows released seats, the offer and a refund', async () => {
      const dave = await service.detail(ids.dave);
      expect(dave.seats).toEqual([
        { label: 'A4', category: 'STANDARD', price: 40000, released: true },
      ]);
      expect(dave.payments).toEqual([
        expect.objectContaining({
          status: 'REFUNDED',
          failureReason: 'Refunded: the seat hold had ended before the payment arrived.',
        }),
      ]);
      const carol = await service.detail(ids.carol);
      expect(carol).toMatchObject({
        subtotal: 180000,
        discount: 10000,
        total: 170000,
        coupon: { code: 'FLAT100', description: '৳100 off 3 seats or more' },
        payments: [],
      });
      expect((await service.detail(ids.alice)).buyer.phone).toBe('01700000001');
    });

    it('404s for unknown ids', async () => {
      await expect(service.detail('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
