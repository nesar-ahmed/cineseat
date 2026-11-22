import { NotFoundException } from '@nestjs/common';
import {
  AdminShowListQuerySchema,
  ScheduleShowsSchema,
  type AdminShowList,
} from '@cineseat/shared';
import { historyOf } from '../common/audit/audit-log';
import { Booking, Payment, Show, User } from '../database/entities';
import { AdminShowsService } from './admin-shows.service';
import { NOW, createScheduleFixture, type ScheduleFixture } from './testing/schedule-fixture';

/**
 * The showtimes read model and the scheduling writes, on the schedule fixture
 * (clock: 12:00 on 12 Nov 2026 in Dhaka, 06:00 UTC):
 *
 *   early    Paper Boats       Agargaon Screen 1     10:00 today (started, over by 11:40)
 *   tonight  Midnight Express  Bashundhara Screen 1  19:00 today, 3D, ৳500 — 10 sold, 1 live hold, paid ৳5,000
 *   late     Paper Boats       Agargaon Screen 1     01:30 on 13 Nov (19:30 UTC on the 12th)
 *   sat      Midnight Express  Bashundhara Screen 1  12:00 on 14 Nov, 2D, ৳400 — no tickets
 */
describe('AdminShowsService (SQLite)', () => {
  let f: ScheduleFixture;
  let service: AdminShowsService;
  let adminId: string;

  const list = (input: Record<string, unknown> = {}) =>
    service.list(AdminShowListQuerySchema.parse(input), NOW);
  const ids = (page: AdminShowList) => page.items.map((show) => show.id);

  beforeEach(async () => {
    f = await createScheduleFixture();
    const repo = f.dataSource.getRepository.bind(f.dataSource);
    service = new AdminShowsService(f.dataSource, f.shows, f.config);
    adminId = (
      await repo(User).save({
        email: 'ops@cineseat.dev',
        name: 'Olu Ops',
        role: 'ADMIN',
        passwordHash: 'x',
      })
    ).id;
    const booking = await repo(Booking).findOneByOrFail({ showId: f.ids.tonight });
    await repo(Payment).insert({
      bookingId: booking.id,
      providerRef: 'ref-ok',
      status: 'SUCCESS',
      amount: 500000,
      userId: booking.userId,
      completedAt: NOW,
    });
  });

  afterEach(() => f.destroy());

  describe('list', () => {
    it('shows what is coming, soonest first, with seats, money and state', async () => {
      const page = await list();
      expect(ids(page)).toEqual([f.ids.tonight, f.ids.late, f.ids.sat]);
      expect(page.counts).toEqual({ upcoming: 3, today: 2, past: 1, all: 4 });
      expect(page.items[0]).toEqual({
        id: f.ids.tonight,
        startsAt: '2026-11-12T13:00:00.000Z',
        endsAt: '2026-11-12T15:00:00.000Z',
        date: '2026-11-12',
        time: '19:00',
        state: 'UPCOMING',
        movie: {
          id: f.ids.m1,
          title: 'Midnight Express',
          genre: 'Drama',
          durationMin: 120,
          certificate: 'U',
          posterPath: null,
        },
        theater: { id: f.ids.bashundhara, name: 'CineSeat Bashundhara', city: 'Dhaka' },
        screen: { id: f.ids.screenB, name: 'Screen 1' },
        format: '3D',
        language: 'Bangla',
        currency: 'BDT',
        basePrice: 50000,
        prices: { STANDARD: 50000, PREMIUM: 60000, RECLINER: 70000 },
        // The expired hold reads as available; the live one does not.
        seats: { total: 12, sold: 10, held: 1, available: 1 },
        availability: 'ALMOST_FULL',
        bookings: 1,
        revenue: 500000,
        locked: true,
      });
      expect(page.items[2]).toMatchObject({
        id: f.ids.sat,
        locked: false,
        availability: 'AVAILABLE',
      });
    });

    it('has tabs for today, the past and everything', async () => {
      expect(ids(await list({ when: 'today' }))).toEqual([f.ids.early, f.ids.tonight]);
      const past = await list({ when: 'past' });
      // The past runs backward by default.
      expect(ids(past)).toEqual([f.ids.early]);
      expect(past.items[0]).toMatchObject({ state: 'ENDED', locked: true });
      expect((await list({ when: 'all' })).total).toBe(4);
    });

    it('filters by day, movie, venue, format, language, availability and sales', async () => {
      expect(ids(await list({ when: 'all', from: '2026-11-13', to: '2026-11-13' }))).toEqual([
        f.ids.late,
      ]);
      expect(ids(await list({ movie: f.ids.m2, when: 'all' }))).toEqual([f.ids.early, f.ids.late]);
      expect(ids(await list({ theater: f.ids.bashundhara }))).toEqual([f.ids.tonight, f.ids.sat]);
      expect(ids(await list({ screen: f.ids.screenA }))).toEqual([f.ids.late]);
      expect(ids(await list({ city: 'chattogram' }))).toEqual([f.ids.late]);
      expect(ids(await list({ format: '3D' }))).toEqual([f.ids.tonight]);
      expect(ids(await list({ language: 'english', when: 'all' }))).toEqual([
        f.ids.early,
        f.ids.late,
      ]);
      expect(ids(await list({ availability: 'ALMOST_FULL,SOLD_OUT' }))).toEqual([f.ids.tonight]);
      expect(ids(await list({ availability: 'AVAILABLE' }))).toEqual([f.ids.late, f.ids.sat]);
      expect(ids(await list({ tickets: 'sold' }))).toEqual([f.ids.tonight]);
      expect(ids(await list({ tickets: 'unsold' }))).toEqual([f.ids.late, f.ids.sat]);
    });

    it('keeps the tabs counting with every other filter applied', async () => {
      const page = await list({ theater: f.ids.agargaon });
      expect(ids(page)).toEqual([f.ids.late]);
      expect(page.counts).toEqual({ upcoming: 1, today: 1, past: 1, all: 2 });
    });

    it('searches movie, theater, screen, city or an exact id', async () => {
      expect(ids(await list({ search: 'midnight' }))).toEqual([f.ids.tonight, f.ids.sat]);
      expect(ids(await list({ search: 'agargaon' }))).toEqual([f.ids.late]);
      expect(ids(await list({ search: f.ids.sat }))).toEqual([f.ids.sat]);
      expect((await list({ search: 'zzz' })).total).toBe(0);
    });

    it('sorts by sales, occupancy, price, movie or theater', async () => {
      expect(ids(await list({ sort: 'sold' }))[0]).toBe(f.ids.tonight);
      expect(ids(await list({ sort: 'occupancy', order: 'asc' }))[2]).toBe(f.ids.tonight);
      expect(ids(await list({ sort: 'price' }))).toEqual([f.ids.tonight, f.ids.sat, f.ids.late]);
      expect(ids(await list({ sort: 'movie' }))).toEqual([f.ids.tonight, f.ids.sat, f.ids.late]);
      expect(ids(await list({ sort: 'theater', order: 'desc' }))[0]).toBe(f.ids.tonight);
      expect(ids(await list({ sort: 'startsAt', order: 'desc' }))).toEqual([
        f.ids.sat,
        f.ids.late,
        f.ids.tonight,
      ]);
    });
  });

  describe('detail', () => {
    it('has seats per category, bookings, and why it cannot change', async () => {
      const tonight = await service.detail(f.ids.tonight, NOW);
      expect(tonight.seatsByCategory).toEqual([
        { category: 'STANDARD', price: 50000, total: 4, sold: 4, held: 0 },
        { category: 'PREMIUM', price: 60000, total: 4, sold: 4, held: 0 },
        { category: 'RECLINER', price: 70000, total: 4, sold: 2, held: 1 },
      ]);
      expect(tonight.bookingCounts).toEqual({ confirmed: 1, pending: 0, failed: 0 });
      expect(tonight.recentBookings).toEqual([
        expect.objectContaining({
          status: 'CONFIRMED',
          buyer: expect.objectContaining({ name: 'Buyer', email: 'buyer@cineseat.dev' }),
          seats: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2'],
          code: expect.stringMatching(/^CS-/),
        }),
      ]);
      expect(tonight.constraints).toEqual({
        canEdit: false,
        editBlockedReason:
          'This show has 10 sold and 1 held seats (1 booking) and cannot be changed.',
        canDelete: false,
        deleteBlockedReason:
          'This show has 10 sold and 1 held seats (1 booking) and cannot be deleted. Cancel its bookings first.',
      });
    });

    it('says a started show cannot change but, without bookings, can go', async () => {
      expect((await service.detail(f.ids.early, NOW)).constraints).toEqual({
        canEdit: false,
        editBlockedReason: 'This show has already started and can no longer be changed.',
        canDelete: true,
        deleteBlockedReason: null,
      });
      expect((await service.detail(f.ids.sat, NOW)).constraints).toMatchObject({
        canEdit: true,
        canDelete: true,
      });
    });

    it('404s for unknown ids', async () => {
      await expect(service.detail('nope', NOW)).rejects.toThrow(NotFoundException);
    });
  });

  describe('batch scheduling (POST /shows/batch)', () => {
    // Paper Boats (100 min) on Agargaon Screen 1, where the 01:30 show runs until 03:10, +20 min.
    const batch = (input: Record<string, unknown>) =>
      f.shows.schedule(
        ScheduleShowsSchema.parse({
          movieId: f.ids.m2,
          screenId: f.ids.screenA,
          basePrice: 30000,
          ...input,
        }),
        adminId,
        NOW,
      );

    it('previews every date × time, earliest first, against the schedule and each other', async () => {
      const preview = await batch({
        dates: ['2026-11-14', '2026-11-13', '2026-11-12'],
        times: ['18:00', '02:00', '03:00'],
        dryRun: true,
      });
      const outcome = preview.results.map(
        (slot) => `${slot.date} ${slot.time} ${slot.error ? slot.error.split(':')[0] : 'ok'}`,
      );
      expect(outcome).toEqual([
        '2026-11-12 02:00 startsAt', // past
        '2026-11-12 03:00 startsAt', // past
        '2026-11-12 18:00 ok',
        '2026-11-13 02:00 startsAt', // the 01:30 show
        '2026-11-13 03:00 startsAt', // the 01:30 show
        '2026-11-13 18:00 ok',
        '2026-11-14 02:00 ok',
        '2026-11-14 03:00 startsAt', // 02:00 in this batch
        '2026-11-14 18:00 ok',
      ]);
      expect(preview).toMatchObject({ dryRun: true, created: 4, failed: 5 });
      expect(preview.results[3].error).toBe(
        'startsAt: Screen 1 is busy: “Paper Boats” starts at 01:30 on 2026-11-13 (with 20 min turnaround).',
      );
      expect(preview.results[7].error).toBe(
        'startsAt: overlaps the show at 02:00 on 2026-11-14 in this batch (with 20 min turnaround).',
      );
      expect(preview.results.every((slot) => slot.showId === null)).toBe(true);
      await expect(f.dataSource.getRepository(Show).count()).resolves.toBe(4);
    });

    it('creates what fits, each with its seats and an audit record', async () => {
      const done = await batch({
        dates: ['2026-11-13', '2026-11-14'],
        times: ['18:00'],
        format: '2D',
      });
      expect(done).toMatchObject({ dryRun: false, created: 2, failed: 0 });
      const [first] = done.results;
      expect(first).toMatchObject({
        date: '2026-11-13',
        time: '18:00',
        startsAt: '2026-11-13T12:00:00.000Z',
        error: null,
      });
      const show = await service.detail(first.showId!, NOW);
      expect(show).toMatchObject({ language: 'English', seats: { total: 6, available: 6 } });
      expect(show.history).toEqual([
        expect.objectContaining({
          action: 'create',
          subject: 'Paper Boats · CineSeat Agargaon, Screen 1 · Fri 13 Nov, 6:00 PM',
          actor: expect.objectContaining({ id: adminId }),
        }),
      ]);
      // Scheduling the same again clashes with what was just created.
      const again = await batch({ dates: ['2026-11-13'], times: ['18:30'], dryRun: true });
      expect(again.results[0].error).toMatch(/^startsAt: Screen 1 is busy/);
    });

    it('refuses what the movie or screen cannot do, for every slot', async () => {
      const result = await batch({
        dates: ['2026-11-20'],
        times: ['12:00'],
        format: '3D',
        dryRun: true,
      });
      expect(result.results[0].error).toBe('format: “Paper Boats” is not released in 3D (2D).');
      await expect(
        batch({ movieId: 'nope', dates: ['2026-11-20'], times: ['12:00'] }),
      ).rejects.toThrow(/movieId/);
    });

    it('validates the batch itself', () => {
      const parse = (input: Record<string, unknown>) =>
        ScheduleShowsSchema.safeParse({
          movieId: 'm',
          screenId: 's',
          basePrice: 1,
          dates: ['2026-11-20'],
          times: ['12:00'],
          ...input,
        }).success;
      expect(parse({})).toBe(true);
      expect(parse({ times: ['25:00'] })).toBe(false);
      expect(parse({ dates: [] })).toBe(false);
      expect(parse({ dates: ['2026-02-30'] })).toBe(false);
      // 31 days × 4 times is more than 100 shows.
      const days = Array.from(
        { length: 31 },
        (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`,
      );
      expect(parse({ dates: days, times: ['10:00', '13:00', '16:00', '19:00'] })).toBe(false);
    });
  });

  describe('changes and bulk actions', () => {
    it('audits changes with the fields that changed, and ignores unchanged values', async () => {
      await f.shows.update(f.ids.sat, { basePrice: 40000, language: 'Bangla' }, adminId, NOW);
      await f.shows.update(f.ids.sat, { basePrice: 45000, format: '2D' }, adminId, NOW);
      const history = await historyOf(f.dataSource.manager, 'shows', f.ids.sat);
      expect(history.map(({ action, fields }) => `${action}:${fields.join(',')}`)).toEqual([
        'update:basePrice',
      ]);
      expect(history[0].subject).toBe(
        'Midnight Express · CineSeat Bashundhara, Screen 1 · Sat 14 Nov, 12:00 PM',
      );
    });

    it('reprices what it can and reports the rest', async () => {
      const result = await f.shows.bulk(
        { action: 'price', ids: [f.ids.sat, f.ids.tonight, 'nope'], basePrice: 42000 },
        adminId,
        NOW,
      );
      expect(result.succeeded).toEqual([f.ids.sat]);
      expect(result.failed).toEqual([
        {
          id: f.ids.tonight,
          label: 'Midnight Express · CineSeat Bashundhara, Screen 1 · Thu 12 Nov, 7:00 PM',
          message: 'This show has 10 sold and 1 held seats (1 booking) and cannot be changed.',
        },
        { id: 'nope', label: null, message: 'Show not found' },
      ]);
      expect((await service.detail(f.ids.sat, NOW)).basePrice).toBe(42000);
    });

    it('cancels shows without tickets, and keeps the record of each', async () => {
      const result = await f.shows.bulk(
        { action: 'delete', ids: [f.ids.sat, f.ids.tonight] },
        adminId,
        NOW,
      );
      expect(result.succeeded).toEqual([f.ids.sat]);
      expect(result.failed.map((failure) => failure.id)).toEqual([f.ids.tonight]);
      await expect(service.detail(f.ids.sat, NOW)).rejects.toThrow(NotFoundException);
      // The show is gone; what happened to it is still readable.
      const [record] = await historyOf(f.dataSource.manager, 'shows', f.ids.sat);
      expect(record).toMatchObject({
        action: 'delete',
        subject: expect.stringContaining('Sat 14 Nov'),
      });
    });
  });
});
