import { Logger } from '@nestjs/common';
import { AdminPaymentListQuerySchema, type AdminPaymentList } from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import {
  BKASH_OK,
  at,
  createCheckoutFlowFixture,
  type CheckoutFlowFixture,
} from '../bookings/testing/checkout-flow-fixture';
import { User } from '../database/entities';
import { AdminPaymentsService } from './admin-payments.service';

/**
 * The admin payments read model, on payments made through the real flow (see
 * the checkout-flow fixture), plus two here: Carol opens a checkout for her
 * held seats and has not paid yet, and Erin pays for C4 with bKash.
 *
 *   created  buyer  amount   status    channel
 *   +42      Erin    ৳600    SUCCESS   BKASH
 *   +41      Carol  ৳1,700   PENDING   —
 *   +6       Dave    ৳400    REFUNDED  CARD   (his hold had ended)
 *   +5       Bob     ৳500    SUCCESS   CARD
 *   +3       Bob     ৳500    FAILED    CARD   (declined)
 *   +1       Alice   ৳800    SUCCESS   CARD
 */
describe('AdminPaymentsService (SQLite)', () => {
  let f: CheckoutFlowFixture;
  let service: AdminPaymentsService;
  let erin: string;

  const list = (input: Record<string, unknown> = {}) =>
    service.list(AdminPaymentListQuerySchema.parse(input));
  const rows = (page: AdminPaymentList) =>
    page.items.map((item) => `${item.buyer.name} ${item.status}`);

  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

  beforeEach(async () => {
    f = await createCheckoutFlowFixture();
    service = new AdminPaymentsService(f.dataSource, f.config);

    await f.checkout.pay(f.users.carol, f.bookings.carol, { couponCode: 'FLAT100' }, at(41));

    erin = (
      await f.dataSource
        .getRepository(User)
        .save({ email: 'erin@cineseat.dev', name: 'Erin', passwordHash: 'x' })
    ).id;
    const hold = await f.holds.place(
      erin,
      { showId: f.ids.sat, seatIds: await f.seatIds(['C4']) },
      at(42),
    );
    const session = await f.checkout.pay(erin, hold.id, {}, at(42));
    await f.gateway.pay(f.refOf(session), BKASH_OK, at(43));
    await f.deliver(at(43));
  });

  afterEach(() => f.destroy());

  it('lists every attempt, newest first, with its booking, buyer, show and the money', async () => {
    const page = await list();
    expect(rows(page)).toEqual([
      'Erin SUCCESS',
      'Carol PENDING',
      'Dave REFUNDED',
      'Bob SUCCESS',
      'Bob FAILED',
      'Alice SUCCESS',
    ]);
    expect(page.counts).toEqual({ all: 6, PENDING: 1, SUCCESS: 3, FAILED: 1, REFUNDED: 1 });
    expect(page.totals).toEqual({
      collected: 80000 + 50000 + 60000,
      refunded: 40000,
      failed: 50000,
      open: 170000,
    });

    const [erinPaid, carolOpen, , bobPaid, bobDeclined] = page.items;
    expect(bobPaid).toMatchObject({
      provider: 'mock',
      amount: 50000,
      method: 'Visa •••• 4242',
      channel: 'CARD',
      failureReason: null,
      completedAt: at(5).toISOString(),
      booking: { id: f.bookings.bob, code: bookingCode(f.bookings.bob), status: 'CONFIRMED' },
      buyer: { id: f.users.bob, name: 'Bob', email: 'bob@cineseat.dev' },
      show: {
        id: f.ids.sat,
        date: '2026-11-14',
        time: '12:00',
        movie: { id: f.ids.m1, title: 'Midnight Express' },
        theater: { id: f.ids.bashundhara, name: 'CineSeat Bashundhara' },
      },
    });
    expect(bobPaid.createdAt).toBe(at(5).toISOString());
    expect(bobDeclined).toMatchObject({
      method: 'Visa •••• 0002',
      failureReason: expect.stringMatching(/declined/i),
    });
    expect(erinPaid).toMatchObject({ channel: 'BKASH', method: expect.stringMatching(/^bKash/) });
    // Still open at the provider: no method, no outcome yet.
    expect(carolOpen).toMatchObject({
      amount: 170000,
      method: null,
      channel: null,
      completedAt: null,
      booking: { status: 'PENDING' },
    });
  });

  it('finds a payment by reference, booking code, buyer or id', async () => {
    const { items } = await list();
    const bobPaid = items.find((item) => item.status === 'SUCCESS' && item.buyer.name === 'Bob')!;
    expect(rows(await list({ search: bobPaid.providerRef }))).toEqual(['Bob SUCCESS']);
    expect(rows(await list({ search: bobPaid.id }))).toEqual(['Bob SUCCESS']);
    const code = bookingCode(f.bookings.bob);
    expect(rows(await list({ search: code }))).toEqual(['Bob SUCCESS', 'Bob FAILED']);
    expect((await list({ search: code.slice(3).toLowerCase() })).total).toBe(2);
    expect((await list({ search: f.bookings.bob })).total).toBe(2);
    expect(rows(await list({ search: 'DAVE@' }))).toEqual(['Dave REFUNDED']);
    expect(rows(await list({ search: 'eri' }))).toEqual(['Erin SUCCESS']);
    expect((await list({ search: 'nobody' })).total).toBe(0);
  });

  it('filters by status, channel, buyer, day and amount', async () => {
    expect(rows(await list({ status: 'FAILED,REFUNDED' }))).toEqual([
      'Dave REFUNDED',
      'Bob FAILED',
    ]);
    expect(rows(await list({ channel: 'BKASH' }))).toEqual(['Erin SUCCESS']);
    expect((await list({ channel: 'CARD' })).total).toBe(4);
    expect((await list({ channel: 'NAGAD' })).total).toBe(0);
    expect(rows(await list({ user: f.users.bob }))).toEqual(['Bob SUCCESS', 'Bob FAILED']);
    expect((await list({ user: `${f.users.alice},${erin}` })).total).toBe(2);
    // All of them started on 12 Nov, cinema time.
    expect((await list({ from: '2026-11-12', to: '2026-11-12' })).total).toBe(6);
    expect((await list({ from: '2026-11-13' })).total).toBe(0);
    expect((await list({ to: '2026-11-11' })).total).toBe(0);
    expect(rows(await list({ minAmount: 60000 }))).toEqual([
      'Erin SUCCESS',
      'Carol PENDING',
      'Alice SUCCESS',
    ]);
    expect((await list({ maxAmount: 50000 })).total).toBe(3);
    expect((await list({ minAmount: 50000, maxAmount: 50000 })).total).toBe(2);
  });

  it('counts the tabs with every other filter, and the money in what the status selects', async () => {
    const page = await list({ status: 'SUCCESS', channel: 'CARD' });
    expect(rows(page)).toEqual(['Bob SUCCESS', 'Alice SUCCESS']);
    expect(page.total).toBe(2);
    expect(page.counts).toEqual({ all: 4, PENDING: 0, SUCCESS: 2, FAILED: 1, REFUNDED: 1 });
    expect(page.totals).toEqual({ collected: 130000, refunded: 0, failed: 0, open: 0 });
  });

  it('sorts by amount and completion (open ones last), both ways', async () => {
    expect(rows(await list({ sort: 'amount' }))[0]).toBe('Carol PENDING');
    expect(rows(await list({ sort: 'amount', order: 'asc' }))[0]).toBe('Dave REFUNDED');
    const completed = rows(await list({ sort: 'completed' }));
    expect(completed[0]).toBe('Erin SUCCESS');
    expect(completed.at(-1)).toBe('Carol PENDING');
    const completedAsc = rows(await list({ sort: 'completed', order: 'asc' }));
    expect(completedAsc[0]).toBe('Alice SUCCESS');
    expect(completedAsc.at(-1)).toBe('Carol PENDING');
    expect(rows(await list({ order: 'asc' }))[0]).toBe('Alice SUCCESS');
  });

  it('pages without overlap', async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => list({ page, pageSize: 4 })));
    expect(pages.map((page) => page.items.length)).toEqual([4, 2, 0]);
    expect(new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size).toBe(6);
    expect(pages[2].total).toBe(6);
  });

  it('rejects inverted ranges', () => {
    expect(() =>
      AdminPaymentListQuerySchema.parse({ from: '2026-11-13', to: '2026-11-12' }),
    ).toThrow();
    expect(() => AdminPaymentListQuerySchema.parse({ minAmount: 2, maxAmount: 1 })).toThrow();
  });
});
