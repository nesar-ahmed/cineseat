import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShowListQuerySchema, MovieShowtimesQuerySchema, type Showtime } from '@cineseat/shared';
import { ShowSeat } from '../database/entities';
import { NOW, createScheduleFixture, type ScheduleFixture } from './testing/schedule-fixture';

const ids = (shows: Showtime[]) => shows.map((show) => show.id);

describe('ShowsService (SQLite)', () => {
  let fx: ScheduleFixture;
  beforeAll(async () => {
    fx = await createScheduleFixture();
  });
  afterAll(() => fx.destroy());

  const search = (input: Record<string, unknown> = {}) =>
    fx.shows.search(ShowListQuerySchema.parse(input), NOW);

  describe('search', () => {
    it('without a date: upcoming shows only, earliest first', async () => {
      expect(ids(await search())).toEqual([fx.ids.tonight, fx.ids.late, fx.ids.sat]);
    });

    it('with a date: that Dhaka day, started shows included but not bookable', async () => {
      const today = await search({ date: '2026-11-12' });
      expect(ids(today)).toEqual([fx.ids.early, fx.ids.tonight]);
      expect(today[0]).toMatchObject({ bookable: false, time: '10:00' });
      expect(ids(await search({ date: '2026-11-13' }))).toEqual([fx.ids.late]); // 19:30 UTC on the 12th
    });

    it('filters by movie, theater, city, format and language', async () => {
      expect(ids(await search({ movie: fx.ids.m2 }))).toEqual([fx.ids.late]);
      expect(ids(await search({ movie: `${fx.ids.m1},${fx.ids.m2}` }))).toHaveLength(3);
      expect(ids(await search({ theater: fx.ids.bashundhara }))).toEqual([
        fx.ids.tonight,
        fx.ids.sat,
      ]);
      expect(ids(await search({ city: 'chattogram' }))).toEqual([fx.ids.late]);
      expect(ids(await search({ format: '3D' }))).toEqual([fx.ids.tonight]);
      expect(ids(await search({ language: 'english' }))).toEqual([fx.ids.late]);
    });

    it('describes a showtime fully: local time, prices per tier, live availability', async () => {
      const [tonight] = await search({ format: '3D' });
      expect(tonight).toMatchObject({
        movieTitle: 'Midnight Express',
        theater: { name: 'CineSeat Bashundhara', city: 'Dhaka' },
        screen: { name: 'Screen 1' },
        startsAt: '2026-11-12T13:00:00.000Z',
        endsAt: '2026-11-12T15:00:00.000Z',
        date: '2026-11-12',
        time: '19:00',
        language: 'Bangla',
        currency: 'BDT',
        priceFrom: 50000,
        prices: { STANDARD: 50000, PREMIUM: 60000, RECLINER: 70000 },
        // 10 sold + 1 live hold; the expired hold is free again.
        seats: { total: 12, available: 1 },
        availability: 'ALMOST_FULL',
        bookable: true,
      });
      const [late] = await search({ movie: fx.ids.m2 });
      expect(late).toMatchObject({
        prices: { STANDARD: 30000 },
        seats: { total: 6, available: 6 },
        availability: 'AVAILABLE',
      });
    });
  });

  describe('a movie’s showtimes', () => {
    const week = (movieId: string, input: Record<string, unknown> = {}) =>
      fx.shows.movieShowtimes(movieId, MovieShowtimesQuerySchema.parse(input), NOW);

    it('returns a week of days with counts, and the shows', async () => {
      const schedule = await week(fx.ids.m1);
      expect(schedule.timeZone).toBe('Asia/Dhaka');
      expect(schedule.days.map((day) => day.date)).toEqual([
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
      ]);
      expect(schedule.days.map((day) => day.shows)).toEqual([1, 0, 1, 0, 0, 0, 0]);
      expect(ids(schedule.shows)).toEqual([fx.ids.tonight, fx.ids.sat]);
    });

    it('keeps today’s started shows, counted as not bookable', async () => {
      const schedule = await week(fx.ids.m2);
      expect(schedule.days[0]).toEqual({ date: '2026-11-12', shows: 1, bookable: 0 });
      expect(schedule.days[1]).toEqual({ date: '2026-11-13', shows: 1, bookable: 1 });
    });

    it('narrows by city, theater and format, and 404s for an unknown movie', async () => {
      expect((await week(fx.ids.m1, { city: 'Chattogram' })).shows).toEqual([]);
      expect(ids((await week(fx.ids.m1, { format: '3D' })).shows)).toEqual([fx.ids.tonight]);
      expect(ids((await week(fx.ids.m1, { theater: fx.ids.bashundhara })).shows)).toHaveLength(2);
      await expect(week('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('detail and seat map', () => {
    it('adds the movie and venue to a showtime', async () => {
      await expect(fx.shows.findOne(fx.ids.tonight, NOW)).resolves.toMatchObject({
        movie: { id: fx.ids.m1, title: 'Midnight Express', durationMin: 120, posterPath: null },
        theater: { name: 'CineSeat Bashundhara', address: 'Rupgan' },
      });
      await expect(fx.shows.findOne('nope', NOW)).rejects.toThrow(NotFoundException);
    });

    it('maps every seat with its live state, category, label and price', async () => {
      const map = await fx.shows.seatMap(fx.ids.tonight, NOW);
      expect(map).toMatchObject({
        rows: 3,
        cols: 4,
        currency: 'BDT',
        rules: { holdMinutes: 5, maxSeats: 6 },
      });
      expect(map.counts).toEqual({ available: 1, held: 1, booked: 10 });
      expect(map.seats.map((seat) => seat.label)).toEqual([
        'A1',
        'A2',
        'A3',
        'A4',
        'B1',
        'B2',
        'B3',
        'B4',
        'C1',
        'C2',
        'C3',
        'C4',
      ]);
      expect(map.seats.slice(-2)).toEqual([
        expect.objectContaining({
          label: 'C3',
          category: 'RECLINER',
          status: 'AVAILABLE',
          price: 70000,
        }), // hold expired
        expect.objectContaining({
          label: 'C4',
          category: 'RECLINER',
          status: 'HELD',
          price: 70000,
        }),
      ]);
      expect(map.seats[4]).toMatchObject({
        label: 'B1',
        category: 'PREMIUM',
        price: 60000,
        status: 'BOOKED',
      });
    });
  });

  describe('scheduling', () => {
    const base = () => ({
      movieId: fx.ids.m1,
      screenId: fx.ids.screenB,
      format: '2D' as const,
      basePrice: 40000,
    });

    it('creates a show with its seat map and the movie’s language', async () => {
      const show = await fx.shows.create(
        { ...base(), startsAt: '2026-11-16T10:00:00+06:00' },
        null,
        NOW,
      );
      expect(show).toMatchObject({
        language: 'Bangla',
        date: '2026-11-16',
        time: '10:00',
        seats: { total: 12, available: 12 },
      });
      await fx.shows.remove(show.id, null, NOW);
      await expect(
        fx.dataSource.getRepository(ShowSeat).countBy({ showId: show.id }),
      ).resolves.toBe(0);
    });

    it('refuses formats the movie or the screen does not have', async () => {
      await expect(
        fx.shows.create(
          { ...base(), movieId: fx.ids.m2, format: '3D', startsAt: '2026-11-16T10:00:00+06:00' },
          null,
          NOW,
        ),
      ).rejects.toThrow(/not released in 3D/);
      await expect(
        fx.shows.create(
          {
            ...base(),
            screenId: fx.ids.screenA,
            format: '3D',
            startsAt: '2026-11-16T10:00:00+06:00',
          },
          null,
          NOW,
        ),
      ).rejects.toThrow(/cannot show 3D/);
    });

    it('refuses past times, shows before release and unknown ids', async () => {
      await expect(
        fx.shows.create({ ...base(), startsAt: '2026-11-12T11:00:00+06:00' }, null, NOW),
      ).rejects.toThrow(/in the future/);
      await expect(
        fx.shows.create(
          { ...base(), movieId: fx.ids.m3, startsAt: '2026-11-30T10:00:00+06:00' },
          null,
          NOW,
        ),
      ).rejects.toThrow(/released on 2026-12-01/);
      await expect(
        fx.shows.create(
          { ...base(), movieId: 'nope', startsAt: '2026-11-16T10:00:00+06:00' },
          null,
          NOW,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        fx.shows.create(
          { ...base(), screenId: 'nope', startsAt: '2026-11-16T10:00:00+06:00' },
          null,
          NOW,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('keeps a screen to one show at a time, turnaround included', async () => {
      // Tonight runs 19:00–21:00, plus 20 minutes: 21:19 clashes, 21:20 fits.
      await expect(
        fx.shows.create({ ...base(), startsAt: '2026-11-12T21:19:00+06:00' }, null, NOW),
      ).rejects.toThrow(ConflictException);
      await expect(
        fx.shows.create({ ...base(), startsAt: '2026-11-12T17:30:00+06:00' }, null, NOW),
      ).rejects.toThrow(/busy/);
      const fits = await fx.shows.create(
        { ...base(), startsAt: '2026-11-12T21:20:00+06:00' },
        null,
        NOW,
      );
      await fx.shows.remove(fits.id, null, NOW);
    });

    it('changes a show without tickets, and refuses ones with tickets or already started', async () => {
      await expect(
        fx.shows.update(
          fx.ids.sat,
          { startsAt: '2026-11-14T15:00:00+06:00', basePrice: 45000 },
          null,
          NOW,
        ),
      ).resolves.toMatchObject({ time: '15:00', priceFrom: 45000 });
      await expect(
        fx.shows.update(fx.ids.sat, { startsAt: '2026-11-12T20:00:00+06:00' }, null, NOW),
      ).rejects.toThrow(/busy/);
      await expect(fx.shows.update(fx.ids.tonight, { basePrice: 1 }, null, NOW)).rejects.toThrow(
        /10 sold and 1 held/,
      );
      await expect(fx.shows.update(fx.ids.early, { basePrice: 1 }, null, NOW)).rejects.toThrow(
        /already started/,
      );
    });

    it('deletes a show without tickets only', async () => {
      await expect(fx.shows.remove(fx.ids.tonight, null, NOW)).rejects.toThrow(ConflictException);
      await expect(fx.shows.remove('nope', null, NOW)).rejects.toThrow(NotFoundException);
    });
  });
});
