import type { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { MovieListQuerySchema, type MovieListQuery } from '@cineseat/shared';
import { Movie, MovieGenre, Screen, Show, Theater, User } from '../../database/entities';
import { buildDataSourceOptions } from '../../database/typeorm.options';

/**
 * A small, fully known catalog on a real SQLite file (all migrations applied),
 * with a frozen clock: it is 12:00 on 12 Nov 2026 in Dhaka.
 *
 *   A  Action, Thriller · Bangla · U/A · 4.8 · 2D+3D · pop 90 — Dhaka 3D tonight; a Chattogram show that already started
 *   B  Drama            · English · U   · 4.2 · 2D    · pop 70 — Chattogram at 01:30 on 13 Nov (19:30 UTC on the 12th)
 *   C  Comedy, Family   · Bangla · U   · —   · 2D    · pop 50 — Gulshan on 14 Nov
 *   D  Sci-Fi           · English · U/A · —   · 2D    · pop 95 — COMING_SOON, releases 1 Dec, no shows
 *   E  Horror           · Hindi  · A   · 3.9 · 2D    · pop 10 — NOW_SHOWING, only a show yesterday
 */
export const NOW = new Date('2026-11-12T06:00:00.000Z');
export const TIME_ZONE = 'Asia/Dhaka';

export type Fixture = {
  dataSource: DataSource;
  dir: string;
  uploadDir: string;
  config: ConfigService;
  ids: Record<'A' | 'B' | 'C' | 'D' | 'E', string>;
  /** An ADMIN account, the actor of edits (audit rows need a real user). */
  adminId: string;
  theaters: Record<'bashundhara' | 'gulshan' | 'agargaon', string>;
  destroy: () => Promise<void>;
};

export const q = (input: Record<string, unknown> = {}): MovieListQuery =>
  MovieListQuerySchema.parse(input);

export async function createCatalogFixture(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'cineseat-catalog-'));
  const uploadDir = join(dir, 'uploads');
  const dataSource = await new DataSource(
    buildDataSourceOptions(join(dir, 'test.db')),
  ).initialize();
  await dataSource.runMigrations();

  const config = {
    getOrThrow: jest.fn((key: string) => ({ timeZone: TIME_ZONE, uploadDir })[key]),
    get: jest.fn((key: string) => ({ timeZone: TIME_ZONE, uploadDir })[key]),
  } as unknown as ConfigService;

  const m = dataSource.manager;
  const adminId = (
    await m.save(
      m.create(User, {
        email: 'admin@cineseat.dev',
        name: 'Ada Admin',
        role: 'ADMIN',
        passwordHash: 'x',
      }),
    )
  ).id;
  const theater = async (name: string, city: string) =>
    (await m.save(m.create(Theater, { name: `CineSeat ${name}`, city, address: `${name} Road` })))
      .id;
  const theaters = {
    bashundhara: await theater('Bashundhara', 'Dhaka'),
    gulshan: await theater('Gulshan', 'Dhaka'),
    agargaon: await theater('Agargaon', 'Chattogram'),
  };
  const screen = async (theaterId: string) =>
    (await m.save(m.create(Screen, { theaterId, name: 'Screen 1', rows: 2, cols: 2 }))).id;
  const screens = {
    bashundhara: await screen(theaters.bashundhara),
    gulshan: await screen(theaters.gulshan),
    agargaon: await screen(theaters.agargaon),
  };

  const movie = async (fields: Partial<Movie> & { genres: string[] }) => {
    const { genres, ...rest } = fields;
    const saved = await m.save(
      m.create(Movie, {
        description: `${rest.title} — fixture`,
        durationMin: 120,
        releaseDate: new Date('2026-11-01T00:00:00.000Z'),
        status: 'NOW_SHOWING',
        genre: genres[0],
        ...rest,
      }),
    );
    await m.insert(
      MovieGenre,
      genres.map((genre, position) => ({ movieId: saved.id, genre, position })),
    );
    return saved.id;
  };
  const ids = {
    A: await movie({
      title: 'Alpha Run',
      genres: ['Action', 'Thriller'],
      language: 'Bangla',
      certificate: 'U/A',
      ratingAvg: 4.8,
      ratingCount: 900,
      formats: ['2D', '3D'],
      popularity: 90,
      durationMin: 138,
      director: 'Rafiq Hasan',
      cast: ['Arif Chowdhury', 'Nabila Karim'],
      releaseDate: new Date('2026-11-05T00:00:00Z'),
    }),
    B: await movie({
      title: 'beta Tide',
      genres: ['Drama'],
      language: 'English',
      certificate: 'U',
      ratingAvg: 4.2,
      ratingCount: 300,
      popularity: 70,
      durationMin: 96,
      releaseDate: new Date('2026-10-20T00:00:00Z'),
    }),
    C: await movie({
      title: 'Gamma 50% Off',
      genres: ['Comedy', 'Family'],
      language: 'Bangla',
      certificate: 'U',
      popularity: 50,
      durationMin: 110,
      releaseDate: new Date('2026-11-08T00:00:00Z'),
    }),
    D: await movie({
      title: 'Delta Orbit',
      genres: ['Sci-Fi'],
      language: 'English',
      certificate: 'U/A',
      status: 'COMING_SOON',
      popularity: 95,
      durationMin: 149,
      releaseDate: new Date('2026-11-30T18:00:00Z'),
    }),
    E: await movie({
      title: 'Echo_Hollow',
      genres: ['Horror'],
      language: 'Hindi',
      certificate: 'A',
      ratingAvg: 3.9,
      ratingCount: 40,
      popularity: 10,
      durationMin: 104,
      releaseDate: new Date('2026-09-01T00:00:00Z'),
    }),
  };

  const show = (movieId: string, screenId: string, startsAt: string, format = '2D') =>
    m.insert(Show, {
      movieId,
      screenId,
      startsAt: new Date(startsAt),
      language: 'Bangla',
      format,
      basePrice: 40000,
    });
  await show(ids.A, screens.bashundhara, '2026-11-12T13:00:00.000Z', '3D'); // 19:00 tonight, Dhaka
  await show(ids.A, screens.agargaon, '2026-11-12T04:00:00.000Z'); //         10:00 today — already started
  await show(ids.B, screens.agargaon, '2026-11-12T19:30:00.000Z'); //         01:30 on 13 Nov in Dhaka
  await show(ids.C, screens.gulshan, '2026-11-14T10:00:00.000Z');
  await show(ids.E, screens.bashundhara, '2026-11-11T12:00:00.000Z'); //      yesterday

  return {
    dataSource,
    dir,
    uploadDir,
    config,
    ids,
    adminId,
    theaters,
    destroy: async () => {
      await dataSource.destroy();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
