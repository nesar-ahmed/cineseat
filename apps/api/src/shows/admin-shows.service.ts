import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  ADMIN_SHOW_HISTORY_LIMIT,
  ADMIN_SHOW_RECENT_BOOKINGS,
  CURRENCY,
  SeatCategory,
  defaultShowSortOrder,
  type AdminShow,
  type AdminShowDetail,
  type AdminShowList,
  type AdminShowListQuery,
  type AdminShowSort,
  type Certificate,
  type ShowFormat,
} from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import { historyOf } from '../common/audit/audit-log';
import {
  dateInZone,
  dayRangeInZone,
  startOfDayInZone,
  timeInZone,
} from '../common/time/zoned-time';
import { fromSqlTime, placeholders, sqlTime, type SqlValue } from '../database/inventory-lane';
import { containsPattern } from '../movies/movie-filters';
import { seatLabel } from '../theaters/seat-layout';
import { availabilityOf, availabilitySql, pricesFor, seatPrice } from './pricing';
import { ShowsService } from './shows.service';

const MINUTE = 60_000;

/**
 * Per show: seats (live holds only), money from successful payments, paid
 * bookings and live bookings (paid, or holds still running). Both parameters
 * are "now". Aggregated on read — fine for thousands of shows; at a larger
 * scale these would become counters kept by the booking path.
 */
const STATS_CTE = `
  WITH "seat" AS (
    SELECT ss."showId" AS "showId", COUNT(*) AS "total",
           SUM(ss."status" = 'BOOKED') AS "sold",
           SUM(ss."status" = 'HELD' AND ss."holdExpiresAt" > ?) AS "held"
    FROM "show_seats" ss GROUP BY ss."showId"
  ),
  "rev" AS (
    SELECT b."showId" AS "showId", SUM(p."amount") AS "revenue"
    FROM "payments" p JOIN "bookings" b ON b."id" = p."bookingId"
    WHERE p."status" = 'SUCCESS' GROUP BY b."showId"
  ),
  "bk" AS (
    SELECT b."showId" AS "showId", SUM(b."status" = 'CONFIRMED') AS "paid",
           SUM(b."status" = 'CONFIRMED' OR (b."status" = 'PENDING' AND b."expiresAt" > ?)) AS "live"
    FROM "bookings" b GROUP BY b."showId"
  )`;

const FROM = `
  FROM "shows" s
  JOIN "movies" m ON m."id" = s."movieId"
  JOIN "screens" sc ON sc."id" = s."screenId"
  JOIN "theaters" t ON t."id" = sc."theaterId"
  LEFT JOIN "seat" ON "seat"."showId" = s."id"
  LEFT JOIN "rev" ON "rev"."showId" = s."id"
  LEFT JOIN "bk" ON "bk"."showId" = s."id"`;

const TOTAL = 'COALESCE("seat"."total", 0)';
const SOLD = 'COALESCE("seat"."sold", 0)';
const HELD = 'COALESCE("seat"."held", 0)';
const AVAILABLE = `(${TOTAL} - ${SOLD} - ${HELD})`;

const COLUMNS = `
  s."id", s."startsAt", s."format", s."language", s."basePrice", s."screenId",
  m."id" AS "movieId", m."title", m."genre", m."durationMin", m."certificate", m."posterPath",
  t."id" AS "theaterId", t."name" AS "theaterName", t."city", sc."name" AS "screenName",
  ${TOTAL} AS "total", ${SOLD} AS "sold", ${HELD} AS "held",
  COALESCE("rev"."revenue", 0) AS "revenue", COALESCE("bk"."paid", 0) AS "paid",
  COALESCE("bk"."live", 0) AS "live"`;

const ORDER_BY: Record<AdminShowSort, (direction: string) => string> = {
  startsAt: (d) => `s."startsAt" ${d}`,
  movie: (d) => `m."title" COLLATE NOCASE ${d}, s."startsAt" ASC`,
  theater: (d) => `t."name" COLLATE NOCASE ${d}, sc."name" COLLATE NOCASE ${d}, s."startsAt" ASC`,
  sold: (d) => `${SOLD} ${d}`,
  occupancy: (d) => `(${SOLD} * 1.0 / NULLIF(${TOTAL}, 0)) ${d} NULLS LAST`,
  revenue: (d) => `COALESCE("rev"."revenue", 0) ${d}`,
  price: (d) => `s."basePrice" ${d}`,
};

type Row = {
  id: string;
  startsAt: string;
  format: ShowFormat;
  language: string;
  basePrice: number;
  screenId: string;
  movieId: string;
  title: string;
  genre: string;
  durationMin: number;
  certificate: Certificate;
  posterPath: string | null;
  theaterId: string;
  theaterName: string;
  city: string;
  screenName: string;
  total: number;
  sold: number;
  held: number;
  revenue: number;
  paid: number;
  live: number;
};

type Where = { sql: string; params: SqlValue[] };

/**
 * The admin panel's read model for showtimes (GET /admin/shows, /admin/shows/:id):
 * every show, past and upcoming, with its seats, money and bookings, searchable,
 * filterable and sortable. Read-only: changes go through ShowsService, which
 * applies the rules reported here (`locked`, `constraints`).
 */
@Injectable()
export class AdminShowsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly shows: ShowsService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async list(query: AdminShowListQuery, now: Date = new Date()): Promise<AdminShowList> {
    const at = sqlTime(now);
    const today = dayRangeInZone(dateInZone(now, this.timeZone), this.timeZone);
    const filters = this.where(query);
    const when = this.whenClause(query.when, now);
    const direction = (query.order ?? defaultShowSortOrder(query.sort, query.when)).toUpperCase();

    const [rows, [counts]] = await Promise.all([
      this.dataSource.query<Row[]>(
        `${STATS_CTE} SELECT ${COLUMNS} ${FROM}
         WHERE ${filters.sql} AND ${when.sql}
         ORDER BY ${ORDER_BY[query.sort](direction)}, s."startsAt" ASC, s."id" ASC
         LIMIT ? OFFSET ?`,
        [
          at,
          at,
          ...filters.params,
          ...when.params,
          query.pageSize,
          (query.page - 1) * query.pageSize,
        ],
      ),
      // Tabs: shows per `when` with every other filter applied.
      this.dataSource.query<
        { upcoming: number | null; today: number | null; past: number | null; all: number }[]
      >(
        `${STATS_CTE} SELECT SUM(s."startsAt" > ?) AS "upcoming",
           SUM(s."startsAt" >= ? AND s."startsAt" < ?) AS "today",
           SUM(s."startsAt" <= ?) AS "past", COUNT(*) AS "all"
         ${FROM} WHERE ${filters.sql}`,
        [at, at, at, sqlTime(today.start), sqlTime(today.end), at, ...filters.params],
      ),
    ]);

    const tabs = {
      upcoming: counts.upcoming ?? 0,
      today: counts.today ?? 0,
      past: counts.past ?? 0,
      all: counts.all,
    };
    return {
      items: await this.toDtos(rows, now),
      total: tabs[query.when],
      page: query.page,
      pageSize: query.pageSize,
      counts: tabs,
    };
  }

  async detail(id: string, now: Date = new Date()): Promise<AdminShowDetail> {
    const at = sqlTime(now);
    const rows = await this.dataSource.query<Row[]>(
      `${STATS_CTE} SELECT ${COLUMNS} ${FROM} WHERE s."id" = ?`,
      [at, at, id],
    );
    if (rows.length === 0) throw new NotFoundException('Show not found');
    const [[show], byCategory, bookingCounts, recent, locks, history] = await Promise.all([
      this.toDtos(rows, now),
      this.dataSource.query<
        { category: SeatCategory; total: number; sold: number; held: number }[]
      >(
        `SELECT seat."category", COUNT(*) AS "total",
                SUM(ss."status" = 'BOOKED') AS "sold",
                SUM(ss."status" = 'HELD' AND ss."holdExpiresAt" > ?) AS "held"
         FROM "show_seats" ss JOIN "seats" seat ON seat."id" = ss."seatId"
         WHERE ss."showId" = ? GROUP BY seat."category"`,
        [at, id],
      ),
      this.dataSource.query<
        { confirmed: number | null; pending: number | null; failed: number | null }[]
      >(
        `SELECT SUM("status" = 'CONFIRMED') AS "confirmed",
                SUM("status" = 'PENDING' AND "expiresAt" > ?) AS "pending",
                SUM("status" IN ('FAILED', 'CANCELLED')) AS "failed"
         FROM "bookings" WHERE "showId" = ?`,
        [at, id],
      ),
      this.recentBookings(id),
      this.shows.showLocks([id], now),
      historyOf(this.dataSource.manager, 'shows', id, ADMIN_SHOW_HISTORY_LIMIT),
    ]);
    const lock = locks.get(id)!;
    const order = SeatCategory.options;
    return {
      ...show,
      seatsByCategory: byCategory
        .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
        .map((row) => ({
          category: row.category,
          price: seatPrice(show.basePrice, row.category),
          total: row.total,
          sold: row.sold ?? 0,
          held: row.held ?? 0,
        })),
      bookingCounts: {
        confirmed: bookingCounts[0]?.confirmed ?? 0,
        pending: bookingCounts[0]?.pending ?? 0,
        failed: bookingCounts[0]?.failed ?? 0,
      },
      recentBookings: recent,
      constraints: {
        canEdit: lock.editBlocked === null,
        editBlockedReason: lock.editBlocked,
        canDelete: lock.deleteBlocked === null,
        deleteBlockedReason: lock.deleteBlocked,
      },
      history,
    };
  }

  // --- Internals ------------------------------------------------------------------

  private whenClause(when: AdminShowListQuery['when'], now: Date): Where {
    const at = sqlTime(now);
    if (when === 'upcoming') return { sql: 's."startsAt" > ?', params: [at] };
    if (when === 'past') return { sql: 's."startsAt" <= ?', params: [at] };
    if (when === 'today') {
      const day = dayRangeInZone(dateInZone(now, this.timeZone), this.timeZone);
      return {
        sql: 's."startsAt" >= ? AND s."startsAt" < ?',
        params: [sqlTime(day.start), sqlTime(day.end)],
      };
    }
    return { sql: '1 = 1', params: [] };
  }

  /** Everything in `query` but `when`, paging and sort, as SQL on the aliases of FROM. */
  private where(query: AdminShowListQuery): Where {
    const clauses: string[] = ['1 = 1'];
    const params: SqlValue[] = [];
    const inList = (column: string, values: readonly string[], lower = false) => {
      if (!values.length) return;
      clauses.push(`${lower ? `LOWER(${column})` : column} IN (${placeholders(values.length)})`);
      params.push(...values.map((value) => (lower ? value.toLowerCase() : value)));
    };

    const search = query.search?.trim();
    if (search) {
      // Movie, theater, screen or city, case-insensitive and literal — or an exact show id.
      const like = containsPattern(search);
      clauses.push(`(m."title" LIKE ? ESCAPE '\\' OR t."name" LIKE ? ESCAPE '\\'
        OR sc."name" LIKE ? ESCAPE '\\' OR t."city" LIKE ? ESCAPE '\\' OR s."id" = ?)`);
      params.push(like, like, like, like, search);
    }
    if (query.from) {
      clauses.push('s."startsAt" >= ?');
      params.push(sqlTime(startOfDayInZone(query.from, this.timeZone)));
    }
    if (query.to) {
      clauses.push('s."startsAt" < ?');
      params.push(sqlTime(dayRangeInZone(query.to, this.timeZone).end));
    }
    inList('s."movieId"', query.movie);
    inList('t."id"', query.theater);
    inList('sc."id"', query.screen);
    inList('t."city"', query.city, true);
    inList('s."format"', query.format);
    inList('s."language"', query.language, true);
    inList(availabilitySql(TOTAL, AVAILABLE), query.availability);
    if (query.tickets) clauses.push(`${SOLD} ${query.tickets === 'sold' ? '>' : '='} 0`);
    return { sql: clauses.join(' AND '), params };
  }

  private async toDtos(rows: Row[], now: Date): Promise<AdminShow[]> {
    if (rows.length === 0) return [];
    const screenIds = [...new Set(rows.map((row) => row.screenId))];
    const categories = await this.dataSource.query<{ screenId: string; category: SeatCategory }[]>(
      `SELECT DISTINCT "screenId", "category" FROM "seats" WHERE "screenId" IN (${placeholders(screenIds.length)})`,
      screenIds,
    );
    const categoriesOf = new Map<string, SeatCategory[]>();
    for (const row of categories)
      categoriesOf.set(row.screenId, [...(categoriesOf.get(row.screenId) ?? []), row.category]);

    return rows.map((row) => {
      const startsAt = fromSqlTime(row.startsAt);
      const endsAt = new Date(startsAt.getTime() + row.durationMin * MINUTE);
      const available = Math.max(0, row.total - row.sold - row.held);
      const state = now < startsAt ? 'UPCOMING' : now < endsAt ? 'RUNNING' : 'ENDED';
      return {
        id: row.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        date: dateInZone(startsAt, this.timeZone),
        time: timeInZone(startsAt, this.timeZone),
        state,
        movie: {
          id: row.movieId,
          title: row.title,
          genre: row.genre,
          durationMin: row.durationMin,
          certificate: row.certificate,
          posterPath: row.posterPath,
        },
        theater: { id: row.theaterId, name: row.theaterName, city: row.city },
        screen: { id: row.screenId, name: row.screenName },
        format: row.format,
        language: row.language,
        currency: CURRENCY,
        basePrice: row.basePrice,
        prices: pricesFor(row.basePrice, categoriesOf.get(row.screenId) ?? []),
        seats: { total: row.total, sold: row.sold, held: row.held, available },
        availability: availabilityOf(row.total, available),
        bookings: row.paid,
        revenue: row.revenue,
        locked: state !== 'UPCOMING' || row.sold + row.held + row.live > 0,
      };
    });
  }

  private async recentBookings(showId: string): Promise<AdminShowDetail['recentBookings']> {
    const bookings = await this.dataSource.query<
      {
        id: string;
        status: string;
        totalAmount: number;
        createdAt: string;
        userId: string;
        name: string;
        email: string;
      }[]
    >(
      `SELECT b."id", b."status", b."totalAmount", b."createdAt", u."id" AS "userId", u."name", u."email"
       FROM "bookings" b JOIN "users" u ON u."id" = b."userId"
       WHERE b."showId" = ?
       ORDER BY b."createdAt" DESC, b."id" ASC
       LIMIT ${ADMIN_SHOW_RECENT_BOOKINGS}`,
      [showId],
    );
    if (bookings.length === 0) return [];
    const seats = await this.dataSource.query<{ bookingId: string; row: number; number: number }[]>(
      `SELECT bs."bookingId", seat."row", seat."number"
       FROM "booking_seats" bs
       JOIN "show_seats" ss ON ss."id" = bs."showSeatId"
       JOIN "seats" seat ON seat."id" = ss."seatId"
       WHERE bs."bookingId" IN (${placeholders(bookings.length)})
       ORDER BY seat."row", seat."number"`,
      bookings.map((booking) => booking.id),
    );
    const seatsOf = new Map<string, string[]>();
    for (const seat of seats)
      seatsOf.set(seat.bookingId, [
        ...(seatsOf.get(seat.bookingId) ?? []),
        seatLabel(seat.row, seat.number),
      ]);
    return bookings.map((booking) => ({
      id: booking.id,
      code: bookingCode(booking.id),
      status: booking.status,
      buyer: { id: booking.userId, name: booking.name, email: booking.email },
      seats: seatsOf.get(booking.id) ?? [],
      amount: booking.totalAmount,
      createdAt: fromSqlTime(booking.createdAt).toISOString(),
    }));
  }
}
