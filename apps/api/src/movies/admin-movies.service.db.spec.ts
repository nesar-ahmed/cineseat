import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminMovieListQuerySchema, type AdminMovie, type AdminMovieList } from '@cineseat/shared';
import { Booking, Movie, MovieGenre, Payment, Show, User } from '../database/entities';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../shows/testing/schedule-fixture';
import { AdminMoviesService } from './admin-movies.service';
import { MoviesService } from './movies.service';

const titles = (page: AdminMovieList) => page.items.map((movie) => movie.title);

/**
 * The admin read model and the schedule limits on edits, on the schedule
 * fixture (clock: 12:00 on 12 Nov 2026 in Dhaka):
 *
 *   m1 Midnight Express  2D+3D, 120 min — tonight 19:00 (3D, Bashundhara, 10 sold, 1 live hold)
 *                                          and Sat 14 Nov 12:00 (2D, Bashundhara)
 *   m2 Paper Boats       2D, 100 min    — 10:00 today (started) and 01:30 on the 13th (Agargaon)
 *   m3 Shapla            COMING_SOON, releases 1 Dec — no shows
 */
describe('AdminMoviesService (SQLite)', () => {
  let f: ScheduleFixture;
  let movies: MoviesService;
  let service: AdminMoviesService;
  let adminId: string;

  const list = (input: Record<string, unknown> = {}) =>
    service.list(AdminMovieListQuerySchema.parse(input), NOW);

  beforeEach(async () => {
    f = await createScheduleFixture();
    const repo = f.dataSource.getRepository.bind(f.dataSource);
    movies = new MoviesService(repo(Movie), repo(MovieGenre), repo(Show), f.dataSource, f.config);
    service = new AdminMoviesService(f.dataSource, movies, f.config);
    adminId = (
      await repo(User).save({
        email: 'admin@cineseat.dev',
        name: 'Ada Admin',
        role: 'ADMIN',
        passwordHash: 'x',
      })
    ).id;

    // Tonight's 10 seats were paid in one payment of ৳5,000; a refunded one is not revenue.
    const booking = await repo(Booking).findOneByOrFail({ showId: f.ids.tonight });
    for (const [status, amount] of [
      ['SUCCESS', 500000],
      ['REFUNDED', 50000],
    ] as const) {
      await repo(Payment).insert({
        bookingId: booking.id,
        providerRef: `ref-${status}`,
        status,
        amount,
        userId: booking.userId,
        completedAt: NOW,
      });
    }
  });

  afterEach(() => f.destroy());

  describe('list', () => {
    it('lists every movie with record times and all-time figures', async () => {
      const page = await list({ sort: 'title' });
      expect(titles(page)).toEqual(['Midnight Express', 'Paper Boats', 'Shapla']);
      expect(page).toMatchObject({
        total: 3,
        page: 1,
        pageSize: 20,
        counts: { all: 3, NOW_SHOWING: 2, COMING_SOON: 1 },
      });
      const [m1, m2, m3] = page.items;
      expect(m1.stats).toEqual({
        shows: 2,
        upcomingShows: 2,
        nextShowAt: '2026-11-12T13:00:00.000Z',
        lastShowAt: '2026-11-14T06:00:00.000Z',
        ticketsSold: 10,
        revenue: 500000,
      });
      // The show at 10:00 has started: it counts as a show, not as upcoming.
      expect(m2.stats).toMatchObject({ shows: 2, upcomingShows: 1, ticketsSold: 0, revenue: 0 });
      expect(m3.stats).toEqual({
        shows: 0,
        upcomingShows: 0,
        nextShowAt: null,
        lastShowAt: null,
        ticketsSold: 0,
        revenue: 0,
      });
      expect(m1).toMatchObject({ genres: ['Drama'], formats: ['2D', '3D'], status: 'NOW_SHOWING' });
      expect(new Date(m1.createdAt).toISOString()).toBe(m1.createdAt);
    });

    it('sorts by any column, both ways, with a sensible default direction', async () => {
      expect(titles(await list({ sort: 'title', order: 'desc' }))).toEqual([
        'Shapla',
        'Paper Boats',
        'Midnight Express',
      ]);
      expect(titles(await list({ sort: 'tickets' }))[0]).toBe('Midnight Express');
      expect(titles(await list({ sort: 'revenue', order: 'asc' }))).toEqual([
        'Paper Boats',
        'Shapla',
        'Midnight Express',
      ]);
      expect(titles(await list({ sort: 'shows' }))).toEqual([
        'Midnight Express',
        'Paper Boats',
        'Shapla',
      ]);
      expect(titles(await list({ sort: 'runtime', order: 'asc' }))[0]).toBe('Paper Boats');
      expect(titles(await list({ sort: 'release' }))[0]).toBe('Shapla');
    });

    it('puts the last edited movie first by default', async () => {
      await f.dataSource
        .getRepository(Movie)
        .update({ id: f.ids.m2 }, { updatedAt: new Date('2030-01-01T00:00:00Z') });
      expect(titles(await list())[0]).toBe('Paper Boats');
    });

    it('filters by schedule, release format, poster and release window', async () => {
      expect(titles(await list({ schedule: 'unscheduled' }))).toEqual(['Shapla']);
      expect(titles(await list({ schedule: 'scheduled', sort: 'title' }))).toEqual([
        'Midnight Express',
        'Paper Boats',
      ]);
      expect(titles(await list({ format: '3D' }))).toEqual(['Midnight Express']);
      expect((await list({ poster: 'with' })).total).toBe(0);
      expect((await list({ poster: 'without' })).total).toBe(3);
      // Shapla is released on 1 Dec in Dhaka (18:00 UTC on 30 Nov).
      expect(titles(await list({ releasedFrom: '2026-12-01' }))).toEqual(['Shapla']);
      expect((await list({ releasedTo: '2026-11-30' })).total).toBe(2);
      expect(titles(await list({ language: 'english' }))).toEqual(['Paper Boats']);
    });

    it('searches title, cast, director, genre or an exact id', async () => {
      expect(titles(await list({ search: 'PAPER' }))).toEqual(['Paper Boats']);
      expect(titles(await list({ search: f.ids.m3 }))).toEqual(['Shapla']);
      expect((await list({ search: 'drama' })).total).toBe(3);
      expect((await list({ search: 'zzz' })).total).toBe(0);
    });

    it('counts the status tabs with every other filter applied', async () => {
      const soon = await list({ status: 'COMING_SOON' });
      expect(titles(soon)).toEqual(['Shapla']);
      expect(soon.total).toBe(1);
      expect(soon.counts).toEqual({ all: 3, NOW_SHOWING: 2, COMING_SOON: 1 });

      const search = await list({ search: 'paper', status: 'COMING_SOON' });
      expect(search.items).toEqual([]);
      expect(search.counts).toEqual({ all: 1, NOW_SHOWING: 1, COMING_SOON: 0 });
    });

    it('pages without overlap', async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => list({ page, pageSize: 1 })));
      expect(pages.map((page) => page.total)).toEqual([3, 3, 3]);
      expect(new Set(pages.flatMap(titles)).size).toBe(3);
    });
  });

  describe('detail', () => {
    it('has the next shows with seats sold and live holds', async () => {
      const detail = await service.detail(f.ids.m1, NOW);
      expect(detail.upcoming).toEqual([
        {
          id: f.ids.tonight,
          startsAt: '2026-11-12T13:00:00.000Z',
          theater: 'CineSeat Bashundhara',
          city: 'Dhaka',
          screen: 'Screen 1',
          format: '3D',
          language: 'Bangla',
          sold: 10,
          held: 1, // the other hold has expired
          capacity: 12,
        },
        expect.objectContaining({ id: f.ids.sat, sold: 0, held: 0, format: '2D' }),
      ]);
      expect(detail.stats.revenue).toBe(500000);
    });

    it('reports what the movie can still be changed to', async () => {
      const m1 = await service.detail(f.ids.m1, NOW);
      expect(m1.constraints).toEqual({
        canDelete: false,
        deleteBlockedReason:
          '“Midnight Express” has 2 scheduled shows. Remove them before deleting the movie.',
        formatsInUse: ['2D', '3D'],
        latestReleaseDate: '2026-11-12',
        // Tonight 19:00 → Saturday 12:00 on the same screen, minus 20 min turnaround.
        maxDurationMin: 41 * 60 - 20,
      });

      const m3 = await service.detail(f.ids.m3, NOW);
      expect(m3.constraints).toEqual({
        canDelete: true,
        deleteBlockedReason: null,
        formatsInUse: [],
        latestReleaseDate: null,
        maxDurationMin: null,
      });
    });

    it('shows the latest changes first, with who made them', async () => {
      await movies.update(f.ids.m3, { tagline: 'Bloom.' }, adminId, NOW);
      await movies.update(f.ids.m3, { status: 'NOW_SHOWING', durationMin: 95 }, adminId, NOW);
      const { history } = await service.detail(f.ids.m3, NOW);
      expect(history.map(({ action, fields }) => ({ action, fields }))).toEqual([
        { action: 'update', fields: ['status', 'durationMin'] },
        { action: 'update', fields: ['tagline'] },
      ]);
      expect(history[0].actor).toEqual({
        id: adminId,
        name: 'Ada Admin',
        email: 'admin@cineseat.dev',
      });
      expect(history[0].at).toBe(NOW.toISOString());
    });

    it('404s for unknown ids', async () => {
      await expect(service.detail('nope', NOW)).rejects.toThrow(NotFoundException);
    });
  });

  describe('edits that would break the schedule (PATCH /movies/:id)', () => {
    const refused = async (id: string, input: Parameters<MoviesService['update']>[1]) => {
      const error = await movies.update(id, input, adminId, NOW).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as { message: string | string[] };
      return ([] as string[]).concat(body.message);
    };
    const movie = (id: string): Promise<AdminMovie> =>
      list({ search: id }).then((page) => page.items[0]);

    it('keeps formats that upcoming shows use', async () => {
      expect(await refused(f.ids.m1, { formats: ['2D'] })).toEqual([
        'formats: 1 upcoming show is in 3D. Move or delete it before removing 3D.',
      ]);
      // Paper Boats' only 2D show that is still to come keeps 2D; adding 3D is fine.
      await expect(
        movies.update(f.ids.m2, { formats: ['2D', '3D'] }, adminId, NOW),
      ).resolves.toMatchObject({ formats: ['2D', '3D'] });
    });

    it('keeps the release day on or before the first upcoming show', async () => {
      expect(await refused(f.ids.m1, { releaseDate: '2026-11-13' })).toEqual([
        'releaseDate: “Midnight Express” has a show on 2026-11-12, so it must be released on or before that day.',
      ]);
      await expect(
        movies.update(f.ids.m1, { releaseDate: '2026-11-12' }, adminId, NOW),
      ).resolves.toMatchObject({ releaseDate: '2026-11-12' });
    });

    it('keeps a longer film from running into the next show on a screen', async () => {
      // Paper Boats at 21:50 on the same screen as tonight's 19:00 Midnight Express:
      // 170 minutes apart, so Midnight Express may run at most 150.
      await f.shows.create(
        {
          movieId: f.ids.m2,
          screenId: f.ids.screenB,
          startsAt: '2026-11-12T21:50:00+06:00',
          format: '2D',
          basePrice: 30000,
        },
        null,
        NOW,
      );
      expect((await service.detail(f.ids.m1, NOW)).constraints.maxDurationMin).toBe(150);
      expect(await refused(f.ids.m1, { durationMin: 151 })).toEqual([
        'durationMin: at most 150 minutes — the show at 19:00 on 2026-11-12 (CineSeat Bashundhara, Screen 1) would run into “Paper Boats” at 21:50 (with 20 min turnaround).',
      ]);
      await expect(
        movies.update(f.ids.m1, { durationMin: 150 }, adminId, NOW),
      ).resolves.toMatchObject({ durationMin: 150 });
      // Shortening is always fine.
      await expect(
        movies.update(f.ids.m1, { durationMin: 90 }, adminId, NOW),
      ).resolves.toMatchObject({ durationMin: 90 });
    });

    it('reports every broken rule at once and changes nothing', async () => {
      const messages = await refused(f.ids.m1, { formats: ['3D'], releaseDate: '2026-11-20' });
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatch(/^formats: /);
      expect(messages[1]).toMatch(/^releaseDate: /);
      expect(await movie(f.ids.m1)).toMatchObject({
        formats: ['2D', '3D'],
        releaseDate: '2026-11-01',
      });
    });

    it('ignores shows that are over', async () => {
      // Paper Boats' show at 10:00 has started; only the 01:30 one limits the release day.
      await expect(
        movies.update(f.ids.m2, { releaseDate: '2026-11-13' }, adminId, NOW),
      ).resolves.toMatchObject({ releaseDate: '2026-11-13' });
    });
  });
});
