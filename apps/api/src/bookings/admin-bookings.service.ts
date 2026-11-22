import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  CURRENCY,
  defaultBookingSortOrder,
  type AdminBooking,
  type AdminBookingDetail,
  type AdminBookingList,
  type AdminBookingListQuery,
  type AdminBookingSort,
  type BookingStatus,
  type PaymentStatus,
  type SeatCategory,
  type ShowFormat,
} from '@cineseat/shared';
import {
  dateInZone,
  dayRangeInZone,
  startOfDayInZone,
  timeInZone,
} from '../common/time/zoned-time';
import { fromSqlTime, placeholders, sqlTime, type SqlValue } from '../database/inventory-lane';
import { containsPattern } from '../movies/movie-filters';
import { seatLabel } from '../theaters/seat-layout';
import { bookingCode } from './bookings.service';

/**
 * Per booking: its payment attempts (how many, money in, money back) and the
 * latest one; and how many of its seats are still its own. Aggregated on read —
 * fine for tens of thousands of bookings; beyond that these become columns the
 * booking path keeps up to date.
 */
const PAYMENT_CTE = `
  WITH "pay" AS (
    SELECT p."bookingId" AS "bookingId", COUNT(*) AS "attempts",
           SUM(CASE WHEN p."status" = 'SUCCESS' THEN p."amount" ELSE 0 END) AS "paid",
           SUM(CASE WHEN p."status" = 'REFUNDED' THEN p."amount" ELSE 0 END) AS "refunded"
    FROM "payments" p GROUP BY p."bookingId"
  ),
  "last" AS (
    SELECT "bookingId", "status", "method" FROM (
      SELECT p."bookingId", p."status", p."method",
             ROW_NUMBER() OVER (PARTITION BY p."bookingId" ORDER BY p."createdAt" DESC, p.rowid DESC) AS "rank"
      FROM "payments" p
    ) WHERE "rank" = 1
  ),
  "seat" AS (
    SELECT bs."bookingId" AS "bookingId", COUNT(*) AS "priced",
           SUM(bs."releasedAt" IS NULL) AS "live", SUM(bs."price") AS "subtotal"
    FROM "booking_seats" bs GROUP BY bs."bookingId"
  )`;

const FROM = `
  FROM "bookings" b
  JOIN "users" u ON u."id" = b."userId"
  JOIN "shows" s ON s."id" = b."showId"
  JOIN "movies" m ON m."id" = s."movieId"
  JOIN "screens" sc ON sc."id" = s."screenId"
  JOIN "theaters" t ON t."id" = sc."theaterId"
  LEFT JOIN "coupons" c ON c."id" = b."couponId"
  LEFT JOIN "pay" ON "pay"."bookingId" = b."id"
  LEFT JOIN "last" ON "last"."bookingId" = b."id"
  LEFT JOIN "seat" ON "seat"."bookingId" = b."id"`;

const COLUMNS = `
  b."id", b."status", b."createdAt", b."updatedAt", b."expiresAt", b."totalAmount",
  u."id" AS "userId", u."name" AS "userName", u."email" AS "userEmail",
  s."id" AS "showId", s."startsAt", s."format", s."language",
  m."id" AS "movieId", m."title", m."genre", m."posterPath",
  t."id" AS "theaterId", t."name" AS "theaterName", t."city",
  sc."id" AS "screenId", sc."name" AS "screenName",
  c."code" AS "couponCode", c."description" AS "couponDescription",
  COALESCE("pay"."attempts", 0) AS "attempts", COALESCE("pay"."paid", 0) AS "paid",
  COALESCE("pay"."refunded", 0) AS "refunded",
  "last"."status" AS "paymentStatus", "last"."method" AS "paymentMethod",
  COALESCE("seat"."priced", 0) AS "priced", COALESCE("seat"."live", 0) AS "live",
  COALESCE("seat"."subtotal", 0) AS "subtotal"`;

const ORDER_BY: Record<AdminBookingSort, string> = {
  created: 'b."createdAt"',
  showtime: 's."startsAt"',
  amount: 'b."totalAmount"',
  seats: 'COALESCE("seat"."priced", 0)',
};

type Row = {
  id: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  totalAmount: number;
  userId: string;
  userName: string;
  userEmail: string;
  showId: string;
  startsAt: string;
  format: ShowFormat;
  language: string;
  movieId: string;
  title: string;
  genre: string;
  posterPath: string | null;
  theaterId: string;
  theaterName: string;
  city: string;
  screenId: string;
  screenName: string;
  couponCode: string | null;
  couponDescription: string | null;
  attempts: number;
  paid: number;
  refunded: number;
  paymentStatus: PaymentStatus | null;
  paymentMethod: string | null;
  priced: number;
  live: number;
  subtotal: number;
};

type Where = { sql: string; params: SqlValue[] };

/**
 * The admin panel's read model for bookings (GET /admin/bookings and
 * /admin/bookings/:id): every buyer's bookings with their show, seats, money
 * and payment attempts. Read-only — bookings change through the booking flow.
 */
@Injectable()
export class AdminBookingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async list(query: AdminBookingListQuery): Promise<AdminBookingList> {
    const filters = this.where(query);
    const withStatus = query.status.length
      ? {
          sql: `${filters.sql} AND b."status" IN (${placeholders(query.status.length)})`,
          params: [...filters.params, ...query.status],
        }
      : filters;
    const direction = (query.order ?? defaultBookingSortOrder(query.sort)).toUpperCase();

    const [rows, statusCounts, [totals]] = await Promise.all([
      this.dataSource.query<Row[]>(
        `${PAYMENT_CTE} SELECT ${COLUMNS} ${FROM} WHERE ${withStatus.sql}
         ORDER BY ${ORDER_BY[query.sort]} ${direction}, b."createdAt" DESC, b."id" ASC
         LIMIT ? OFFSET ?`,
        [...withStatus.params, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      // Tabs: bookings per status with every other filter applied.
      this.dataSource.query<{ status: BookingStatus; n: number }[]>(
        `${PAYMENT_CTE} SELECT b."status" AS "status", COUNT(*) AS "n" ${FROM}
         WHERE ${filters.sql} GROUP BY b."status"`,
        filters.params,
      ),
      this.dataSource.query<
        { seats: number | null; paid: number | null; refunded: number | null }[]
      >(
        `${PAYMENT_CTE} SELECT SUM("seat"."live") AS "seats", SUM("pay"."paid") AS "paid",
                SUM("pay"."refunded") AS "refunded"
         ${FROM} WHERE ${withStatus.sql}`,
        withStatus.params,
      ),
    ]);

    const counts = { all: 0, PENDING: 0, CONFIRMED: 0, FAILED: 0, CANCELLED: 0 };
    for (const row of statusCounts) {
      counts[row.status] = row.n;
      counts.all += row.n;
    }
    const labels = await this.seatLabels(rows);
    return {
      items: rows.map((row) => ({ ...this.toDto(row), seats: labels.get(row.id) ?? [] })),
      total: query.status.length
        ? query.status.reduce((sum, status) => sum + counts[status], 0)
        : counts.all,
      page: query.page,
      pageSize: query.pageSize,
      counts,
      totals: {
        seats: totals?.seats ?? 0,
        paid: totals?.paid ?? 0,
        refunded: totals?.refunded ?? 0,
      },
    };
  }

  async detail(id: string): Promise<AdminBookingDetail> {
    const rows = await this.dataSource.query<Row[]>(
      `${PAYMENT_CTE} SELECT ${COLUMNS} ${FROM} WHERE b."id" = ?`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Booking not found');

    const [seats, payments, [buyer]] = await Promise.all([
      this.dataSource.query<
        {
          row: number;
          number: number;
          category: SeatCategory;
          price: number;
          releasedAt: string | null;
        }[]
      >(
        `SELECT seat."row", seat."number", seat."category", bs."price", bs."releasedAt"
         FROM "booking_seats" bs
         JOIN "show_seats" ss ON ss."id" = bs."showSeatId"
         JOIN "seats" seat ON seat."id" = ss."seatId"
         WHERE bs."bookingId" = ? ORDER BY seat."row", seat."number"`,
        [id],
      ),
      this.dataSource.query<
        {
          id: string;
          provider: string;
          providerRef: string;
          status: PaymentStatus;
          amount: number;
          method: string | null;
          failureReason: string | null;
          createdAt: string;
          completedAt: string | null;
        }[]
      >(
        `SELECT "id", "provider", "providerRef", "status", "amount", "method", "failureReason",
                "createdAt", "completedAt"
         FROM "payments" WHERE "bookingId" = ? ORDER BY "createdAt" DESC, rowid DESC`,
        [id],
      ),
      this.dataSource.query<
        { phone: string | null; since: string; paidBookings: number; spent: number | null }[]
      >(
        `SELECT u."phone", u."createdAt" AS "since",
                (SELECT COUNT(*) FROM "bookings" x WHERE x."userId" = u."id" AND x."status" = 'CONFIRMED') AS "paidBookings",
                (SELECT SUM(p."amount") FROM "payments" p WHERE p."userId" = u."id" AND p."status" = 'SUCCESS') AS "spent"
         FROM "users" u WHERE u."id" = ?`,
        [row.userId],
      ),
    ]);

    const { seats: _labels, ...dto } = this.toDto(row);
    return {
      ...dto,
      seats: seats.map((seat) => ({
        label: seatLabel(seat.row, seat.number),
        category: seat.category,
        price: seat.price,
        released: seat.releasedAt !== null,
      })),
      subtotal: row.subtotal,
      coupon: row.couponCode ? { code: row.couponCode, description: row.couponDescription } : null,
      payments: payments.map((payment) => ({
        ...payment,
        createdAt: fromSqlTime(payment.createdAt).toISOString(),
        completedAt: payment.completedAt ? fromSqlTime(payment.completedAt).toISOString() : null,
      })),
      buyer: {
        ...dto.buyer,
        phone: buyer.phone ?? null,
        since: fromSqlTime(buyer.since).toISOString(),
        paidBookings: buyer.paidBookings,
        spent: buyer.spent ?? 0,
      },
      updatedAt: fromSqlTime(row.updatedAt).toISOString(),
    };
  }

  // --- Internals ------------------------------------------------------------------

  /** Everything in `query` but the status, paging and sort, on the aliases of FROM. */
  private where(query: AdminBookingListQuery): Where {
    const clauses: string[] = ['1 = 1'];
    const params: SqlValue[] = [];
    const inList = (column: string, values: readonly string[], lower = false) => {
      if (!values.length) return;
      clauses.push(`${lower ? `LOWER(${column})` : column} IN (${placeholders(values.length)})`);
      params.push(...values.map((value) => (lower ? value.toLowerCase() : value)));
    };

    const search = query.search?.trim();
    if (search) {
      const like = containsPattern(search);
      const parts = [
        `u."name" LIKE ? ESCAPE '\\'`,
        `u."email" LIKE ? ESCAPE '\\'`,
        `m."title" LIKE ? ESCAPE '\\'`,
        'b."id" = ?',
      ];
      params.push(like, like, like, search);
      // A booking code is "CS-" and the first 8 characters of the id (no dashes there).
      const code = search.replace(/^cs-?/i, '').toLowerCase();
      if (/^[0-9a-f]{4,8}$/.test(code)) {
        parts.push('b."id" LIKE ?');
        params.push(`${code}%`);
      }
      clauses.push(`(${parts.join(' OR ')})`);
    }
    if (query.payment.length) {
      clauses.push(
        `EXISTS (SELECT 1 FROM "payments" fp WHERE fp."bookingId" = b."id" AND fp."status" IN (${placeholders(query.payment.length)}))`,
      );
      params.push(...query.payment);
    }
    inList('m."id"', query.movie);
    inList('t."id"', query.theater);
    inList('s."id"', query.show);
    inList('u."id"', query.user);
    inList('c."code"', query.coupon, true);
    const day = (date: string) => dayRangeInZone(date, this.timeZone);
    if (query.bookedFrom) {
      clauses.push('b."createdAt" >= ?');
      params.push(sqlTime(startOfDayInZone(query.bookedFrom, this.timeZone)));
    }
    if (query.bookedTo) {
      clauses.push('b."createdAt" < ?');
      params.push(sqlTime(day(query.bookedTo).end));
    }
    if (query.showFrom) {
      clauses.push('s."startsAt" >= ?');
      params.push(sqlTime(startOfDayInZone(query.showFrom, this.timeZone)));
    }
    if (query.showTo) {
      clauses.push('s."startsAt" < ?');
      params.push(sqlTime(day(query.showTo).end));
    }
    return { sql: clauses.join(' AND '), params };
  }

  private toDto(row: Row): AdminBooking {
    const startsAt = fromSqlTime(row.startsAt);
    return {
      id: row.id,
      code: bookingCode(row.id),
      status: row.status,
      createdAt: fromSqlTime(row.createdAt).toISOString(),
      expiresAt:
        row.status === 'PENDING' && row.expiresAt ? fromSqlTime(row.expiresAt).toISOString() : null,
      buyer: { id: row.userId, name: row.userName, email: row.userEmail },
      show: {
        id: row.showId,
        startsAt: startsAt.toISOString(),
        date: dateInZone(startsAt, this.timeZone),
        time: timeInZone(startsAt, this.timeZone),
        format: row.format,
        language: row.language,
        movie: { id: row.movieId, title: row.title, genre: row.genre, posterPath: row.posterPath },
        theater: { id: row.theaterId, name: row.theaterName, city: row.city },
        screen: { id: row.screenId, name: row.screenName },
      },
      seats: [],
      currency: CURRENCY,
      total: row.totalAmount,
      discount: Math.max(0, row.subtotal - row.totalAmount),
      couponCode: row.couponCode,
      paid: row.paid,
      refunded: row.refunded,
      payment: row.paymentStatus
        ? { status: row.paymentStatus, method: row.paymentMethod, attempts: row.attempts }
        : null,
    };
  }

  /**
   * Seat labels per booking: the live ones; a booking that no longer has any
   * (its hold ended) shows the seats it held.
   */
  private async seatLabels(rows: Row[]): Promise<Map<string, string[]>> {
    if (rows.length === 0) return new Map();
    const seats = await this.dataSource.query<
      { bookingId: string; row: number; number: number; live: number }[]
    >(
      `SELECT bs."bookingId", seat."row", seat."number", bs."releasedAt" IS NULL AS "live"
       FROM "booking_seats" bs
       JOIN "show_seats" ss ON ss."id" = bs."showSeatId"
       JOIN "seats" seat ON seat."id" = ss."seatId"
       WHERE bs."bookingId" IN (${placeholders(rows.length)})
       ORDER BY seat."row", seat."number"`,
      rows.map((row) => row.id),
    );
    const labels = new Map<string, string[]>();
    for (const row of rows) {
      const mine = seats.filter((seat) => seat.bookingId === row.id);
      const live = mine.filter((seat) => seat.live);
      labels.set(
        row.id,
        (live.length ? live : mine).map((seat) => seatLabel(seat.row, seat.number)),
      );
    }
    return labels;
  }
}
