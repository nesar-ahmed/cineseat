import { ConflictException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateMovieSchema, type Movie as MovieDto } from '@cineseat/shared';
import { Movie, MovieGenre, Show } from '../database/entities';
import { MoviesService } from './movies.service';
import { NOW, createCatalogFixture, q, type Fixture } from './testing/catalog-fixture';

const titles = (page: { items: MovieDto[] }) => page.items.map((movie) => movie.title);

describe('MoviesService (SQLite)', () => {
  let fx: Fixture;
  let service: MoviesService;

  beforeAll(async () => {
    fx = await createCatalogFixture();
    service = new MoviesService(
      fx.dataSource.getRepository(Movie),
      fx.dataSource.getRepository(MovieGenre),
      fx.dataSource.getRepository(Show),
      fx.dataSource,
      fx.config,
    );
  });
  afterAll(() => fx.destroy());

  const list = (input: Record<string, unknown> = {}) => service.list(q(input), NOW);

  describe('browse', () => {
    it('lists everything by popularity, with the API shape', async () => {
      const page = await list();
      expect(page.total).toBe(5);
      expect(titles(page)).toEqual([
        'Delta Orbit',
        'Alpha Run',
        'beta Tide',
        'Gamma 50% Off',
        'Echo_Hollow',
      ]);
      expect(page.items[1]).toMatchObject({
        genre: 'Action',
        genres: ['Action', 'Thriller'],
        certificate: 'U/A',
        formats: ['2D', '3D'],
        rating: 4.8,
        votes: 900,
        cast: ['Arif Chowdhury', 'Nabila Karim'],
        director: 'Rafiq Hasan',
        releaseDate: '2026-11-05',
      });
      // Release day is the calendar day in Dhaka (18:00 UTC on the 30th is 1 Dec there).
      expect(page.items[0]).toMatchObject({
        status: 'COMING_SOON',
        releaseDate: '2026-12-01',
        rating: null,
      });
    });

    it('pages without overlap and reports the full total', async () => {
      const first = await list({ page: 1, pageSize: 2 });
      const second = await list({ page: 2, pageSize: 2 });
      const third = await list({ page: 3, pageSize: 2 });
      expect([first.total, second.total, third.total]).toEqual([5, 5, 5]);
      expect(new Set([...titles(first), ...titles(second), ...titles(third)]).size).toBe(5);
      expect(third.items).toHaveLength(1);
    });

    it('searches title, director, cast and genre, case-insensitively and literally', async () => {
      expect(titles(await list({ search: 'BETA' }))).toEqual(['beta Tide']);
      expect(titles(await list({ search: 'rafiq' }))).toEqual(['Alpha Run']);
      expect(titles(await list({ search: 'nabila' }))).toEqual(['Alpha Run']);
      expect(titles(await list({ search: 'sci-fi' }))).toEqual(['Delta Orbit']);
      // % and _ are characters, not wildcards.
      expect(titles(await list({ search: '50%' }))).toEqual(['Gamma 50% Off']);
      expect(titles(await list({ search: '_' }))).toEqual(['Echo_Hollow']);
      expect((await list({ search: 'zzz' })).total).toBe(0);
    });

    it('ORs options inside a filter and ANDs filters together', async () => {
      expect(titles(await list({ genre: 'drama,comedy' })).sort()).toEqual([
        'Gamma 50% Off',
        'beta Tide',
      ]);
      expect(titles(await list({ genre: ['Action', 'Drama'], language: 'Bangla' }))).toEqual([
        'Alpha Run',
      ]);
      expect(titles(await list({ certificate: 'A' }))).toEqual(['Echo_Hollow']);
      expect(titles(await list({ language: 'english', status: 'NOW_SHOWING' }))).toEqual([
        'beta Tide',
      ]);
    });

    it('filters by rating and running time', async () => {
      expect(titles(await list({ minRating: 4 }))).toEqual(['Alpha Run', 'beta Tide']);
      expect(titles(await list({ maxDuration: 110 })).sort()).toEqual([
        'Echo_Hollow',
        'Gamma 50% Off',
        'beta Tide',
      ]);
      expect(titles(await list({ minDuration: 120, maxDuration: 140 }))).toEqual(['Alpha Run']);
    });

    it('sorts by rating (unrated last), title (ignoring case), runtime and release', async () => {
      expect(titles(await list({ sort: 'rating' }))).toEqual([
        'Alpha Run',
        'beta Tide',
        'Echo_Hollow',
        'Delta Orbit',
        'Gamma 50% Off',
      ]);
      expect(titles(await list({ sort: 'title' }))).toEqual([
        'Alpha Run',
        'beta Tide',
        'Delta Orbit',
        'Echo_Hollow',
        'Gamma 50% Off',
      ]);
      expect(titles(await list({ sort: 'runtime' }))[0]).toBe('beta Tide');
      expect(titles(await list({ sort: 'release', status: 'NOW_SHOWING' }))).toEqual([
        'Gamma 50% Off',
        'Alpha Run',
        'beta Tide',
        'Echo_Hollow',
      ]);
    });
  });

  describe('where and when (read from the show schedule)', () => {
    it('keeps titles with an upcoming show in the city or theater', async () => {
      expect(titles(await list({ city: 'dhaka' }))).toEqual(['Alpha Run', 'Gamma 50% Off']); // E only played yesterday
      // A's Chattogram show already started, so only B is still bookable there.
      expect(titles(await list({ city: 'Chattogram' }))).toEqual(['beta Tide']);
      expect(titles(await list({ theater: fx.theaters.gulshan }))).toEqual(['Gamma 50% Off']);
      expect(titles(await list({ format: '3D' }))).toEqual(['Alpha Run']);
    });

    it('uses the Dhaka calendar day for dates', async () => {
      expect(titles(await list({ date: '2026-11-12' }))).toEqual(['Alpha Run']);
      expect(titles(await list({ date: '2026-11-13' }))).toEqual(['beta Tide']); // 19:30 UTC on the 12th
      expect(titles(await list({ date: '2026-11-11' }))).toEqual([]); // over
      expect(titles(await list({ date: '2026-11-12', city: 'Chattogram' }))).toEqual([]);
    });

    it('lets show filters rest for COMING_SOON titles', async () => {
      expect(
        titles(await list({ status: 'COMING_SOON', city: 'Dhaka', date: '2026-11-13' })),
      ).toEqual(['Delta Orbit']);
      // Without the status filter, an upcoming title has no show to match.
      expect(titles(await list({ city: 'Dhaka' }))).not.toContain('Delta Orbit');
    });
  });

  describe('edit', () => {
    const input = CreateMovieSchema.parse({
      title: 'Shapla',
      description: 'A ferry, a river and a village that doubts her.',
      genres: ['Drama', 'drama', 'Romance'],
      language: 'Bangla',
      durationMin: 118,
      releaseDate: '2026-12-18',
      cast: ['Jaya Ahsan'],
    });

    it('creates a movie with its genres, defaults and release day', async () => {
      const created = await service.create(input, fx.adminId);
      expect(created).toMatchObject({
        title: 'Shapla',
        genre: 'Drama',
        genres: ['Drama', 'Romance'],
        releaseDate: '2026-12-18',
        status: 'COMING_SOON',
        certificate: 'U',
        formats: ['2D'],
        rating: null,
        votes: 0,
        interested: 0,
        tagline: null,
      });
      // Stored as the instant local midnight starts in Dhaka.
      const row = await fx.dataSource.getRepository(Movie).findOneByOrFail({ id: created.id });
      expect(row.releaseDate.toISOString()).toBe('2026-12-17T18:00:00.000Z');
      await service.remove(created.id, fx.adminId);
    });

    it('updates only the fields sent, and replaces the genre list', async () => {
      const created = await service.create(input, fx.adminId);
      const updated = await service.update(
        created.id,
        {
          genres: ['Romance', 'Comedy'],
          status: 'NOW_SHOWING',
        },
        fx.adminId,
      );
      expect(updated).toMatchObject({
        genre: 'Romance',
        genres: ['Romance', 'Comedy'],
        status: 'NOW_SHOWING',
        title: 'Shapla',
        durationMin: 118,
        cast: ['Jaya Ahsan'],
      });
      const again = await service.update(
        created.id,
        {
          tagline: 'She learned to bloom.',
          releaseDate: '2026-12-25',
          formats: ['2D', '3D'],
        },
        fx.adminId,
      );
      expect(again).toMatchObject({
        tagline: 'She learned to bloom.',
        releaseDate: '2026-12-25',
        formats: ['2D', '3D'],
        genres: ['Romance', 'Comedy'],
      });
      await service.remove(created.id, fx.adminId);
      await expect(
        fx.dataSource.getRepository(MovieGenre).countBy({ movieId: created.id }),
      ).resolves.toBe(0);
    });

    it('404s for unknown ids', async () => {
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
      await expect(service.update('nope', { title: 'x' }, fx.adminId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove('nope', fx.adminId)).rejects.toThrow(NotFoundException);
    });

    it('refuses to delete a movie that still has shows', async () => {
      await expect(service.remove(fx.ids.A, fx.adminId)).rejects.toThrow(ConflictException);
      await expect(service.remove(fx.ids.A, fx.adminId)).rejects.toThrow(/has 2 scheduled shows/);
      await expect(service.findOne(fx.ids.A)).resolves.toMatchObject({ title: 'Alpha Run' });
    });
  });

  describe('posters', () => {
    const posterFile = (name: string) => join(fx.uploadDir, 'posters', name);
    const touch = (name: string) => {
      mkdirSync(join(fx.uploadDir, 'posters'), { recursive: true });
      writeFileSync(posterFile(name), 'img');
    };

    it('points the movie at the new file and deletes the previous one', async () => {
      touch('first.jpg');
      await expect(service.setPoster(fx.ids.B, 'first.jpg', fx.adminId)).resolves.toMatchObject({
        posterPath: '/uploads/posters/first.jpg',
      });
      touch('second.png');
      await service.setPoster(fx.ids.B, 'second.png', fx.adminId);
      expect(existsSync(posterFile('first.jpg'))).toBe(false);
      expect(existsSync(posterFile('second.png'))).toBe(true);
    });

    it('deletes an upload for a movie that does not exist', async () => {
      touch('orphan.webp');
      await expect(service.setPoster('nope', 'orphan.webp', fx.adminId)).rejects.toThrow(
        NotFoundException,
      );
      expect(existsSync(posterFile('orphan.webp'))).toBe(false);
    });

    it('never deletes files outside the posters folder', async () => {
      writeFileSync(join(fx.uploadDir, 'keep.txt'), 'x');
      await fx.dataSource
        .getRepository(Movie)
        .update({ id: fx.ids.C }, { posterPath: '/uploads/posters/../keep.txt' });
      touch('c.jpg');
      await service.setPoster(fx.ids.C, 'c.jpg', fx.adminId);
      expect(existsSync(join(fx.uploadDir, 'keep.txt'))).toBe(true);
    });
  });
  describe('audit trail', () => {
    const actions = async (movieId: string) =>
      (
        await fx.dataSource.query<{ action: string; actorId: string }[]>(
          `SELECT "action", "actorId" FROM "audit_logs" WHERE "entity" = 'movies' AND "entityId" = ?
           ORDER BY "createdAt", rowid`,
          [movieId],
        )
      ).map((row) => `${row.action}${row.actorId === fx.adminId ? '' : ' (someone else)'}`);
    const input = CreateMovieSchema.parse({
      title: 'Audited',
      description: 'A movie whose every change is on record.',
      genres: ['Drama'],
      language: 'Bangla',
      durationMin: 100,
      releaseDate: '2026-12-01',
    });

    it('records who created, changed and deleted a movie, and which fields changed', async () => {
      const created = await service.create(input, fx.adminId);
      await service.update(
        created.id,
        { title: 'Audited Again', status: 'NOW_SHOWING', durationMin: 100 },
        fx.adminId,
      );
      await service.remove(created.id, fx.adminId);
      // durationMin was sent but did not change, so it is not part of the record.
      expect(await actions(created.id)).toEqual([
        'movies.create',
        'movies.update:title,status',
        'movies.delete',
      ]);
    });

    it('treats sending the same values back as a no-op (nothing written, nothing audited)', async () => {
      const created = await service.create(input, fx.adminId);
      const before = await fx.dataSource.getRepository(Movie).findOneByOrFail({ id: created.id });
      const same = await service.update(
        created.id,
        {
          title: created.title,
          genres: created.genres,
          formats: [...created.formats].reverse(), // order of formats does not matter
          releaseDate: created.releaseDate,
          tagline: null,
        },
        fx.adminId,
      );
      expect(same).toEqual(created);
      const after = await fx.dataSource.getRepository(Movie).findOneByOrFail({ id: created.id });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(await actions(created.id)).toEqual(['movies.create']);
      await service.remove(created.id, fx.adminId);
    });
  });

  describe('removing a poster', () => {
    it('clears posterPath, deletes the file and is a no-op without a poster', async () => {
      const dir = join(fx.uploadDir, 'posters');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'gone.jpg'), 'img');
      await service.setPoster(fx.ids.E, 'gone.jpg', fx.adminId);

      await expect(service.removePoster(fx.ids.E, fx.adminId)).resolves.toMatchObject({
        posterPath: null,
      });
      expect(existsSync(join(dir, 'gone.jpg'))).toBe(false);
      await expect(service.removePoster(fx.ids.E, fx.adminId)).resolves.toMatchObject({
        posterPath: null,
      });
      await expect(service.removePoster('nope', fx.adminId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulk actions', () => {
    const make = (title: string) =>
      service.create(
        CreateMovieSchema.parse({
          title,
          description: 'Made for a bulk action test.',
          genres: ['Comedy'],
          language: 'English',
          durationMin: 90,
          releaseDate: '2026-12-05',
        }),
        fx.adminId,
      );

    it('changes the status of every movie, skipping those already there', async () => {
      const one = await make('Bulk One');
      const two = await make('Bulk Two');
      await service.update(two.id, { status: 'NOW_SHOWING' }, fx.adminId);

      const result = await service.bulk(
        { action: 'status', ids: [one.id, two.id, 'nope'], status: 'NOW_SHOWING' },
        fx.adminId,
      );
      expect(result.succeeded).toEqual([one.id, two.id]);
      expect(result.failed).toEqual([{ id: 'nope', title: null, message: 'Movie not found' }]);
      await expect(service.findOne(one.id)).resolves.toMatchObject({ status: 'NOW_SHOWING' });
      await service.bulk({ action: 'delete', ids: [one.id, two.id] }, fx.adminId);
    });

    it('deletes what it can and reports movies that still have shows', async () => {
      const free = await make('Bulk Free');
      const result = await service.bulk({ action: 'delete', ids: [free.id, fx.ids.A] }, fx.adminId);
      expect(result.succeeded).toEqual([free.id]);
      expect(result.failed).toEqual([
        {
          id: fx.ids.A,
          title: 'Alpha Run',
          message: '“Alpha Run” has 2 scheduled shows. Remove them before deleting the movie.',
        },
      ]);
      await expect(service.findOne(free.id)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(fx.ids.A)).resolves.toMatchObject({ title: 'Alpha Run' });
    });
  });
});
