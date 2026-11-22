import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import {
  Booking,
  BookingSeat,
  Movie,
  MovieGenre,
  Screen,
  Seat,
  Show,
  ShowSeat,
  Theater,
  User,
} from '../../database/entities';
import { InventoryLane } from '../../database/inventory-lane';
import { buildDataSourceOptions } from '../../database/typeorm.options';
import { TheatersService } from '../../theaters/theaters.service';
import { ShowsService } from '../shows.service';

/**
 * Venues and a schedule on a real SQLite file, with a frozen clock: 12:00 on
 * 12 Nov 2026 in Dhaka (06:00 UTC). Screens are created through TheatersService,
 * so seat generation is exercised too.
 *
 *   Bashundhara (Dhaka)      Screen 1 — 3×4, row A standard, B premium, C recliner, 2D+3D
 *   Agargaon (Chattogram)    Screen 1 — 2×3, all standard, 2D
 *
 *   early   M2 @ Agargaon   10:00 today      (started)
 *   tonight M1 @ Bashundhara 19:00 today, 3D, ৳500 — 10 sold, 1 expired hold, 1 live hold
 *   late    M2 @ Agargaon   01:30 on 13 Nov  (19:30 UTC on the 12th)
 *   sat     M1 @ Bashundhara 12:00 on 14 Nov, 2D, ৳400 — no tickets
 */
export const NOW = new Date('2026-11-12T06:00:00.000Z');

export type ScheduleFixture = {
  dataSource: DataSource;
  lane: InventoryLane;
  config: ConfigService;
  shows: ShowsService;
  theaters: TheatersService;
  ids: {
    bashundhara: string;
    agargaon: string;
    screenB: string;
    screenA: string;
    m1: string;
    m2: string;
    m3: string;
    early: string;
    tonight: string;
    late: string;
    sat: string;
  };
  destroy: () => Promise<void>;
};

export async function createScheduleFixture(): Promise<ScheduleFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'cineseat-schedule-'));
  const dataSource = await new DataSource(
    buildDataSourceOptions(join(dir, 'test.db')),
  ).initialize();
  await dataSource.runMigrations();
  const lane = new InventoryLane(dataSource);
  const settings: Record<string, unknown> = {
    timeZone: 'Asia/Dhaka',
    holdMinutes: 5,
    uploadDir: join(dir, 'uploads'),
    paymentWindowMinutes: 5,
    webOrigin: 'http://localhost:3000',
    mockPaymentSecret: 'test-only-mock-payment-secret',
    mockWebhookDelayMs: 0,
    mockWebhookUrl: 'http://127.0.0.1:9/unused',
  };
  const config = {
    getOrThrow: (key: string) => settings[key],
    get: (key: string) => settings[key],
  } as unknown as ConfigService;
  const repo = <T extends object>(entity: new () => T) => dataSource.getRepository(entity);

  const theaters = new TheatersService(
    repo(Theater),
    repo(Screen),
    repo(Seat),
    repo(Show),
    dataSource,
    config,
  );
  const shows = new ShowsService(
    repo(Show),
    repo(ShowSeat),
    repo(Seat),
    repo(Movie),
    repo(Screen),
    repo(Booking),
    dataSource,
    config,
    lane,
  );
  const m = dataSource.manager;

  const bashundhara = (
    await theaters.create(
      {
        name: 'CineSeat Bashundhara',
        city: 'Dhaka',
        address: 'Rupgan',
        amenities: ['Recliner row', '3D'],
      },
      null,
    )
  ).id;
  const agargaon = (
    await theaters.create(
      {
        name: 'CineSeat Agargaon',
        city: 'Chattogram',
        address: 'Column No. 4',
        amenities: [],
      },
      null,
    )
  ).id;
  const screenB = (
    await theaters.createScreen(
      bashundhara,
      {
        name: 'Screen 1',
        rows: 3,
        cols: 4,
        premiumRows: 1,
        reclinerRows: 1,
        formats: ['2D', '3D'],
      },
      null,
    )
  ).id;
  const screenA = (
    await theaters.createScreen(
      agargaon,
      {
        name: 'Screen 1',
        rows: 2,
        cols: 3,
        premiumRows: 0,
        reclinerRows: 0,
        formats: ['2D'],
      },
      null,
    )
  ).id;

  const movie = async (title: string, fields: Partial<Movie>) => {
    const saved = await m.save(
      m.create(Movie, {
        title,
        description: `${title} — fixture`,
        genre: 'Drama',
        language: 'Bangla',
        durationMin: 120,
        releaseDate: new Date('2026-11-01T00:00:00Z'),
        status: 'NOW_SHOWING',
        ...fields,
      }),
    );
    await m.insert(MovieGenre, { movieId: saved.id, genre: 'Drama', position: 0 });
    return saved.id;
  };
  const m1 = await movie('Midnight Express', { formats: ['2D', '3D'], durationMin: 120 });
  const m2 = await movie('Paper Boats', { formats: ['2D'], durationMin: 100, language: 'English' });
  const m3 = await movie('Shapla', {
    formats: ['2D'],
    status: 'COMING_SOON',
    releaseDate: new Date('2026-11-30T18:00:00Z'),
  });

  const tonight = (
    await shows.create(
      {
        movieId: m1,
        screenId: screenB,
        startsAt: '2026-11-12T19:00:00+06:00',
        format: '3D',
        basePrice: 50000,
      },
      null,
      NOW,
    )
  ).id;
  const late = (
    await shows.create(
      {
        movieId: m2,
        screenId: screenA,
        startsAt: '2026-11-12T19:30:00Z',
        format: '2D',
        basePrice: 30000,
      },
      null,
      NOW,
    )
  ).id;
  const sat = (
    await shows.create(
      {
        movieId: m1,
        screenId: screenB,
        startsAt: '2026-11-14T12:00:00+06:00',
        format: '2D',
        basePrice: 40000,
      },
      null,
      NOW,
    )
  ).id;

  // A show that already started cannot be created through the API; insert it directly.
  const early = randomUUID();
  await m.insert(Show, {
    id: early,
    movieId: m2,
    screenId: screenA,
    startsAt: new Date('2026-11-12T04:00:00Z'),
    language: 'English',
    format: '2D',
    basePrice: 30000,
  });
  const seatsA = await m.find(Seat, { where: { screenId: screenA } });
  await m.insert(
    ShowSeat,
    seatsA.map((seat) => ({ showId: early, seatId: seat.id, status: 'AVAILABLE' })),
  );

  // Tonight: 10 seats sold in one booking, one hold that expired, one that is live.
  const user = await m.save(
    m.create(User, { email: 'buyer@cineseat.dev', name: 'Buyer', passwordHash: 'x' }),
  );
  const seatMap = await m
    .getRepository(ShowSeat)
    .createQueryBuilder('ss')
    .innerJoinAndSelect('ss.seat', 'seat')
    .where('ss.showId = :tonight', { tonight })
    .orderBy('seat.row')
    .addOrderBy('seat.number')
    .getMany();
  const bookingId = randomUUID();
  await m.insert(Booking, {
    id: bookingId,
    userId: user.id,
    showId: tonight,
    status: 'CONFIRMED',
    totalAmount: 0,
  });
  for (const seat of seatMap.slice(0, 10)) {
    await m.update(ShowSeat, { id: seat.id }, { status: 'BOOKED' });
    await m.insert(BookingSeat, { bookingId, showSeatId: seat.id, price: 50000 });
  }
  await m.update(
    ShowSeat,
    { id: seatMap[10].id },
    { status: 'HELD', heldBy: user.id, holdExpiresAt: new Date(NOW.getTime() - 60_000) },
  );
  await m.update(
    ShowSeat,
    { id: seatMap[11].id },
    { status: 'HELD', heldBy: user.id, holdExpiresAt: new Date(NOW.getTime() + 180_000) },
  );

  return {
    dataSource,
    lane,
    config,
    shows,
    theaters,
    ids: { bashundhara, agargaon, screenB, screenA, m1, m2, m3, early, tonight, late, sat },
    destroy: async () => {
      await dataSource.destroy();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
