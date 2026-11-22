import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  ADMIN_THEATER_UPCOMING_LIMIT,
  AdminShowListQuerySchema,
  defaultTheaterSortOrder,
  type AdminScreen,
  type AdminScreenBrief,
  type AdminTheater,
  type AdminTheaterDetail,
  type AdminTheaterList,
  type AdminTheaterListQuery,
  type AdminTheaterSort,
  type AdminVenueStats,
  type SeatCategory,
  type ShowFormat,
} from '@cineseat/shared';
import { historyOf } from '../common/audit/audit-log';
import { dateInZone, dayRangeInZone } from '../common/time/zoned-time';
import { fromSqlTime, placeholders, sqlTime, type SqlValue } from '../database/inventory-lane';
import { containsPattern } from '../movies/movie-filters';
import { AdminShowsService } from '../shows/admin-shows.service';
import { layoutLocked, screenDeleteBlocked, theaterDeleteBlocked } from './theaters.service';

/**
 * All-time figures per venue (`level`: theater or screen), one row each:
 * shows, upcoming shows, the next one, shows today (and how many movies),
 * seats sold, occupancy of what has not started, and successful payments.
 * Parameters: `statsParams(now, today)`.
 *
 * Aggregated on read: fine for a chain of cinemas. At a much larger scale these
 * would become counters kept by the scheduling and booking paths.
 */
function statsCte(level: 'theater' | 'screen'): string {
  const key = level === 'theater' ? 'sc."theaterId"' : 'sc."id"';
  return `
  WITH "sh" AS (
    SELECT ${key} AS "venueId", COUNT(*) AS "shows",
           SUM(s."startsAt" > ?) AS "upcoming",
           MIN(CASE WHEN s."startsAt" > ? THEN s."startsAt" END) AS "nextShowAt",
           SUM(s."startsAt" >= ? AND s."startsAt" < ?) AS "todayShows",
           COUNT(DISTINCT CASE WHEN s."startsAt" >= ? AND s."startsAt" < ? THEN s."movieId" END) AS "todayMovies"
    FROM "shows" s JOIN "screens" sc ON sc."id" = s."screenId" GROUP BY ${key}
  ),
  "occ" AS (
    SELECT ${key} AS "venueId", SUM(ss."status" = 'BOOKED') AS "tickets",
           SUM(s."startsAt" > ?) AS "capacity",
           SUM(s."startsAt" > ? AND ss."status" = 'BOOKED') AS "soldAhead"
    FROM "show_seats" ss
    JOIN "shows" s ON s."id" = ss."showId"
    JOIN "screens" sc ON sc."id" = s."screenId"
    GROUP BY ${key}
  ),
  "rev" AS (
    SELECT ${key} AS "venueId", SUM(p."amount") AS "revenue"
    FROM "payments" p
    JOIN "bookings" b ON b."id" = p."bookingId"
    JOIN "shows" s ON s."id" = b."showId"
    JOIN "screens" sc ON sc."id" = s."screenId"
    WHERE p."status" = 'SUCCESS' GROUP BY ${key}
  )`;
}

function statsParams(now: Date, today: { start: Date; end: Date }): SqlValue[] {
  const at = sqlTime(now);
  const [start, end] = [sqlTime(today.start), sqlTime(today.end)];
  return [at, at, start, end, start, end, at, at];
}

/** Joins the stats CTEs to a venue aliased `alias`. */
const joinStats = (alias: string) => `
  LEFT JOIN "sh" ON "sh"."venueId" = ${alias}."id"
  LEFT JOIN "occ" ON "occ"."venueId" = ${alias}."id"
  LEFT JOIN "rev" ON "rev"."venueId" = ${alias}."id"`;

const STATS_COLUMNS = `
  COALESCE("sh"."shows", 0) AS "shows", COALESCE("sh"."upcoming", 0) AS "upcoming",
  "sh"."nextShowAt" AS "nextShowAt",
  COALESCE("sh"."todayShows", 0) AS "todayShows", COALESCE("sh"."todayMovies", 0) AS "todayMovies",
  COALESCE("occ"."tickets", 0) AS "tickets", COALESCE("occ"."capacity", 0) AS "capacity",
  COALESCE("occ"."soldAhead", 0) AS "soldAhead", COALESCE("rev"."revenue", 0) AS "revenue"`;

type StatsRow = {
  shows: number;
  upcoming: number;
  nextShowAt: string | null;
  todayShows: number;
  todayMovies: number;
  tickets: number;
  capacity: number;
  soldAhead: number;
  revenue: number;
};

type TheaterRow = StatsRow & {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: string;
  screens: number;
  seats: number;
};

type ScreenRow = StatsRow & {
  id: string;
  name: string;
  rows: number;
  cols: number;
  formats: string;
};

/** Screens and seats per theater, for the list (joined as `scr`). */
const VENUE_SIZE = `
  LEFT JOIN (
    SELECT sc."theaterId" AS "theaterId", COUNT(DISTINCT sc."id") AS "screens", COUNT(seat."id") AS "seats"
    FROM "screens" sc LEFT JOIN "seats" seat ON seat."screenId" = sc."id"
    GROUP BY sc."theaterId"
  ) "scr" ON "scr"."theaterId" = t."id"`;

const THEATER_COLUMNS = `
  t."id", t."name", t."city", t."address", t."amenities",
  COALESCE("scr"."screens", 0) AS "screens", COALESCE("scr"."seats", 0) AS "seats", ${STATS_COLUMNS}`;

const ORDER_BY: Record<AdminTheaterSort, (direction: string) => string> = {
  city: (d) => `t."city" COLLATE NOCASE ${d}, t."name" COLLATE NOCASE ASC`,
  name: (d) => `t."name" COLLATE NOCASE ${d}`,
  screens: (d) => `COALESCE("scr"."screens", 0) ${d}`,
  seats: (d) => `COALESCE("scr"."seats", 0) ${d}`,
  shows: (d) => `COALESCE("sh"."upcoming", 0) ${d}`,
  tickets: (d) => `COALESCE("occ"."tickets", 0) ${d}`,
  revenue: (d) => `COALESCE("rev"."revenue", 0) ${d}`,
  occupancy: (d) =>
    `(COALESCE("occ"."soldAhead", 0) * 1.0 / NULLIF("occ"."capacity", 0)) ${d} NULLS LAST`,
};

type Where = { sql: string; params: SqlValue[] };

/** `formats` is stored comma-separated ("2D,3D"). */
const formatsOf = (stored: string) => (stored ? stored.split(',') : []) as ShowFormat[];
const byFormat = (a: string, b: string) => a.localeCompare(b);

/**
 * The admin panel's read model for cinemas (GET /admin/theaters, /admin/theaters/:id):
 * every theater with its screens, sizes and figures, searchable, filterable and
 * sortable; one theater with each screen's figures and limits, its next shows
 * and its history. Read-only: changes go through TheatersService, which applies
 * the limits reported here.
 */
@Injectable()
export class AdminTheatersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly shows: AdminShowsService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async list(query: AdminTheaterListQuery, now: Date = new Date()): Promise<AdminTheaterList> {
    const stats = statsParams(now, this.today(now));
    const filters = this.where(query, { skipCity: true });
    const withCity = query.city.length
      ? {
          sql: `${filters.sql} AND LOWER(t."city") IN (${placeholders(query.city.length)})`,
          params: [...filters.params, ...query.city.map((city) => city.toLowerCase())],
        }
      : filters;
    const direction = (query.order ?? defaultTheaterSortOrder(query.sort)).toUpperCase();
    const from = `FROM "theaters" t ${VENUE_SIZE} ${joinStats('t')}`;

    const [rows, cities] = await Promise.all([
      this.dataSource.query<TheaterRow[]>(
        `${statsCte('theater')} SELECT ${THEATER_COLUMNS} ${from}
         WHERE ${withCity.sql}
         ORDER BY ${ORDER_BY[query.sort](direction)}, t."name" COLLATE NOCASE ASC, t."id" ASC
         LIMIT ? OFFSET ?`,
        [...stats, ...withCity.params, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      // City tabs: cinemas per city with every other filter applied.
      this.dataSource.query<{ city: string; count: number }[]>(
        `${statsCte('theater')} SELECT t."city" AS "city", COUNT(*) AS "count" ${from}
         WHERE ${filters.sql} GROUP BY t."city" ORDER BY t."city" COLLATE NOCASE`,
        [...stats, ...filters.params],
      ),
    ]);

    const all = cities.reduce((sum, row) => sum + row.count, 0);
    const wanted = new Set(query.city.map((city) => city.toLowerCase()));
    return {
      items: await this.toDtos(rows),
      total: query.city.length
        ? cities
            .filter((row) => wanted.has(row.city.toLowerCase()))
            .reduce((sum, row) => sum + row.count, 0)
        : all,
      page: query.page,
      pageSize: query.pageSize,
      counts: { all, cities },
    };
  }

  async detail(id: string, now: Date = new Date()): Promise<AdminTheaterDetail> {
    const stats = statsParams(now, this.today(now));
    const rows = await this.dataSource.query<TheaterRow[]>(
      `${statsCte('theater')} SELECT ${THEATER_COLUMNS}
       FROM "theaters" t ${VENUE_SIZE} ${joinStats('t')} WHERE t."id" = ?`,
      [...stats, id],
    );
    if (rows.length === 0) throw new NotFoundException('Theater not found');
    const [[theater], screens, upcoming, history] = await Promise.all([
      this.toDtos(rows),
      this.screens(id, now),
      this.shows.list(
        AdminShowListQuerySchema.parse({
          theater: id,
          when: 'upcoming',
          pageSize: ADMIN_THEATER_UPCOMING_LIMIT,
        }),
        now,
      ),
      historyOf(this.dataSource.manager, 'theaters', id),
    ]);
    const { screens: _brief, ...rest } = theater;
    return {
      ...rest,
      screens,
      upcoming: upcoming.items,
      constraints: {
        canDelete: theater.stats.shows === 0,
        deleteBlockedReason:
          theater.stats.shows === 0
            ? null
            : theaterDeleteBlocked(theater.name, theater.stats.shows),
      },
      history,
    };
  }

  // --- Internals ------------------------------------------------------------------

  private today(now: Date) {
    return dayRangeInZone(dateInZone(now, this.timeZone), this.timeZone);
  }

  /** Everything in `query` but paging and sort (and, optionally, the city), on `t` and the stats. */
  private where(query: AdminTheaterListQuery, options: { skipCity?: boolean } = {}): Where {
    const clauses: string[] = ['1 = 1'];
    const params: SqlValue[] = [];

    const search = query.search?.trim();
    if (search) {
      // Name, city, address, an amenity or a screen's name, case-insensitive and literal — or an exact id.
      const like = containsPattern(search);
      clauses.push(`(t."name" LIKE ? ESCAPE '\\' OR t."city" LIKE ? ESCAPE '\\'
        OR t."address" LIKE ? ESCAPE '\\' OR t."amenities" LIKE ? ESCAPE '\\' OR t."id" = ?
        OR EXISTS (SELECT 1 FROM "screens" ss WHERE ss."theaterId" = t."id" AND ss."name" LIKE ? ESCAPE '\\'))`);
      params.push(like, like, like, like, search, like);
    }
    if (query.city.length && !options.skipCity) {
      clauses.push(`LOWER(t."city") IN (${placeholders(query.city.length)})`);
      params.push(...query.city.map((city) => city.toLowerCase()));
    }
    if (query.amenity.length) {
      clauses.push(
        `EXISTS (SELECT 1 FROM json_each(t."amenities") a WHERE LOWER(a."value") IN (${placeholders(query.amenity.length)}))`,
      );
      params.push(...query.amenity.map((amenity) => amenity.toLowerCase()));
    }
    if (query.format.length) {
      clauses.push(
        `EXISTS (SELECT 1 FROM "screens" fs WHERE fs."theaterId" = t."id" AND (${query.format
          .map(() => `(',' || fs."formats" || ',') LIKE ?`)
          .join(' OR ')}))`,
      );
      params.push(...query.format.map((format) => `%,${format},%`));
    }
    if (query.schedule) {
      clauses.push(`COALESCE("sh"."upcoming", 0) ${query.schedule === 'scheduled' ? '>' : '='} 0`);
    }
    return { sql: clauses.join(' AND '), params };
  }

  private statsOf(row: StatsRow): AdminVenueStats {
    return {
      shows: row.shows,
      upcomingShows: row.upcoming,
      nextShowAt: row.nextShowAt ? fromSqlTime(row.nextShowAt).toISOString() : null,
      ticketsSold: row.tickets,
      revenue: row.revenue,
      occupancy: { sold: row.soldAhead, capacity: row.capacity },
    };
  }

  private async toDtos(rows: TheaterRow[]): Promise<AdminTheater[]> {
    if (rows.length === 0) return [];
    const briefs = await this.dataSource.query<
      { id: string; theaterId: string; name: string; formats: string; seats: number }[]
    >(
      `SELECT sc."id", sc."theaterId", sc."name", sc."formats",
              (SELECT COUNT(*) FROM "seats" seat WHERE seat."screenId" = sc."id") AS "seats"
       FROM "screens" sc WHERE sc."theaterId" IN (${placeholders(rows.length)})
       ORDER BY sc."name" COLLATE NOCASE`,
      rows.map((row) => row.id),
    );
    const screensOf = new Map<string, AdminScreenBrief[]>();
    for (const screen of briefs) {
      screensOf.set(screen.theaterId, [
        ...(screensOf.get(screen.theaterId) ?? []),
        {
          id: screen.id,
          name: screen.name,
          formats: formatsOf(screen.formats).sort(byFormat),
          seats: screen.seats,
        },
      ]);
    }
    return rows.map((row) => {
      const screens = screensOf.get(row.id) ?? [];
      return {
        id: row.id,
        name: row.name,
        city: row.city,
        address: row.address,
        amenities: JSON.parse(row.amenities) as string[],
        formats: [...new Set(screens.flatMap((screen) => screen.formats))].sort(byFormat),
        screens,
        seatCount: row.seats,
        today: { shows: row.todayShows, movies: row.todayMovies },
        stats: this.statsOf(row),
      };
    });
  }

  /** Each screen with its layout as entered, figures and limits. */
  private async screens(theaterId: string, now: Date): Promise<AdminScreen[]> {
    const at = sqlTime(now);
    const [rows, seats, inUse] = await Promise.all([
      this.dataSource.query<ScreenRow[]>(
        `${statsCte('screen')} SELECT sc."id", sc."name", sc."rows", sc."cols", sc."formats", ${STATS_COLUMNS}
         FROM "screens" sc ${joinStats('sc')}
         WHERE sc."theaterId" = ? ORDER BY sc."name" COLLATE NOCASE`,
        [...statsParams(now, this.today(now)), theaterId],
      ),
      this.dataSource.query<
        { screenId: string; category: SeatCategory; seats: number; rows: number }[]
      >(
        `SELECT seat."screenId", seat."category", COUNT(*) AS "seats", COUNT(DISTINCT seat."row") AS "rows"
         FROM "seats" seat JOIN "screens" sc ON sc."id" = seat."screenId"
         WHERE sc."theaterId" = ? GROUP BY seat."screenId", seat."category"`,
        [theaterId],
      ),
      this.dataSource.query<{ screenId: string; format: ShowFormat }[]>(
        `SELECT DISTINCT s."screenId", s."format" FROM "shows" s
         JOIN "screens" sc ON sc."id" = s."screenId"
         WHERE sc."theaterId" = ? AND s."startsAt" > ?`,
        [theaterId, at],
      ),
    ]);

    return rows.map((row) => {
      const mine = seats.filter((seat) => seat.screenId === row.id);
      const of = (category: SeatCategory) => mine.find((seat) => seat.category === category);
      const counts = {
        STANDARD: of('STANDARD')?.seats ?? 0,
        PREMIUM: of('PREMIUM')?.seats ?? 0,
        RECLINER: of('RECLINER')?.seats ?? 0,
      };
      const stats = this.statsOf(row);
      return {
        id: row.id,
        name: row.name,
        rows: row.rows,
        cols: row.cols,
        premiumRows: of('PREMIUM')?.rows ?? 0,
        reclinerRows: of('RECLINER')?.rows ?? 0,
        formats: formatsOf(row.formats).sort(byFormat),
        seatCounts: { total: counts.STANDARD + counts.PREMIUM + counts.RECLINER, ...counts },
        stats,
        constraints: {
          canDelete: stats.shows === 0,
          deleteBlockedReason:
            stats.shows === 0 ? null : screenDeleteBlocked(row.name, stats.shows),
          layoutLocked: stats.shows > 0,
          layoutLockedReason: stats.shows > 0 ? layoutLocked(row.name, stats.shows) : null,
          formatsInUse: inUse
            .filter((show) => show.screenId === row.id)
            .map((show) => show.format)
            .sort(byFormat),
        },
      };
    });
  }
}
