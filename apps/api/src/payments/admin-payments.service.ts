import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type {
  AdminPaymentList,
  AdminPaymentListQuery,
  AdminPaymentRow,
  AdminPaymentSort,
  BookingStatus,
  PaymentChannel,
  PaymentStatus,
} from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import {
  dateInZone,
  dayRangeInZone,
  startOfDayInZone,
  timeInZone,
} from '../common/time/zoned-time';
import { fromSqlTime, placeholders, sqlTime, type SqlValue } from '../database/inventory-lane';
import { containsPattern } from '../movies/movie-filters';

/**
 * How the buyer paid, from the provider's description of it ("Visa •••• 4242",
 * "bKash 017•••••678"); null until the provider has said.
 */
const CHANNEL = `(CASE
  WHEN p."method" IS NULL OR p."method" = '' THEN NULL
  WHEN p."method" LIKE 'bKash%' THEN 'BKASH'
  WHEN p."method" LIKE 'Nagad%' THEN 'NAGAD'
  ELSE 'CARD' END)`;

const FROM = `
  FROM "payments" p
  JOIN "bookings" b ON b."id" = p."bookingId"
  JOIN "users" u ON u."id" = p."userId"
  JOIN "shows" s ON s."id" = b."showId"
  JOIN "movies" m ON m."id" = s."movieId"
  JOIN "screens" sc ON sc."id" = s."screenId"
  JOIN "theaters" t ON t."id" = sc."theaterId"`;

const COLUMNS = `
  p."id", p."provider", p."providerRef", p."status", p."amount", p."method", p."failureReason",
  p."createdAt", p."completedAt", ${CHANNEL} AS "channel",
  b."id" AS "bookingId", b."status" AS "bookingStatus",
  u."id" AS "userId", u."name" AS "userName", u."email" AS "userEmail",
  s."id" AS "showId", s."startsAt", m."id" AS "movieId", m."title", m."genre", m."posterPath",
  t."id" AS "theaterId", t."name" AS "theaterName"`;

const ORDER_BY: Record<AdminPaymentSort, string> = {
  created: 'p."createdAt"',
  completed: 'p."completedAt"',
  amount: 'p."amount"',
};

type Row = {
  id: string;
  provider: string;
  providerRef: string;
  status: PaymentStatus;
  amount: number;
  method: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  channel: PaymentChannel | null;
  bookingId: string;
  bookingStatus: BookingStatus;
  userId: string;
  userName: string;
  userEmail: string;
  showId: string;
  startsAt: string;
  movieId: string;
  title: string;
  genre: string;
  posterPath: string | null;
  theaterId: string;
  theaterName: string;
};

type Where = { sql: string; params: SqlValue[] };

/**
 * The admin panel's read model for payments (GET /admin/payments): every
 * payment attempt with its booking, buyer and show, for reconciliation.
 * Read-only — payments change only through the provider's webhook.
 */
@Injectable()
export class AdminPaymentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async list(query: AdminPaymentListQuery): Promise<AdminPaymentList> {
    const filters = this.where(query);
    const withStatus = query.status.length
      ? {
          sql: `${filters.sql} AND p."status" IN (${placeholders(query.status.length)})`,
          params: [...filters.params, ...query.status],
        }
      : filters;
    const direction = (query.order ?? 'desc').toUpperCase();
    // Open payments have no completion time yet: they sort after the settled ones.
    const nulls = query.sort === 'completed' ? ' NULLS LAST' : '';

    const [rows, statusCounts, [totals]] = await Promise.all([
      this.dataSource.query<Row[]>(
        `SELECT ${COLUMNS} ${FROM} WHERE ${withStatus.sql}
         ORDER BY ${ORDER_BY[query.sort]} ${direction}${nulls}, p."createdAt" DESC, p."id" ASC
         LIMIT ? OFFSET ?`,
        [...withStatus.params, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      // Tabs: attempts per status with every other filter applied.
      this.dataSource.query<{ status: PaymentStatus; n: number }[]>(
        `SELECT p."status" AS "status", COUNT(*) AS "n" ${FROM} WHERE ${filters.sql} GROUP BY p."status"`,
        filters.params,
      ),
      this.dataSource.query<Record<'collected' | 'refunded' | 'failed' | 'open', number | null>[]>(
        `SELECT SUM(CASE WHEN p."status" = 'SUCCESS' THEN p."amount" END) AS "collected",
                SUM(CASE WHEN p."status" = 'REFUNDED' THEN p."amount" END) AS "refunded",
                SUM(CASE WHEN p."status" = 'FAILED' THEN p."amount" END) AS "failed",
                SUM(CASE WHEN p."status" = 'PENDING' THEN p."amount" END) AS "open"
         ${FROM} WHERE ${withStatus.sql}`,
        withStatus.params,
      ),
    ]);

    const counts = { all: 0, PENDING: 0, SUCCESS: 0, FAILED: 0, REFUNDED: 0 };
    for (const row of statusCounts) {
      counts[row.status] = row.n;
      counts.all += row.n;
    }
    return {
      items: rows.map((row) => this.toDto(row)),
      total: query.status.length
        ? query.status.reduce((sum, status) => sum + counts[status], 0)
        : counts.all,
      page: query.page,
      pageSize: query.pageSize,
      counts,
      totals: {
        collected: totals?.collected ?? 0,
        refunded: totals?.refunded ?? 0,
        failed: totals?.failed ?? 0,
        open: totals?.open ?? 0,
      },
    };
  }

  /** Everything in `query` but the status, paging and sort, on the aliases of FROM. */
  private where(query: AdminPaymentListQuery): Where {
    const clauses: string[] = ['1 = 1'];
    const params: SqlValue[] = [];

    const search = query.search?.trim();
    if (search) {
      const like = containsPattern(search);
      const parts = [
        'p."providerRef" = ?',
        `u."name" LIKE ? ESCAPE '\\'`,
        `u."email" LIKE ? ESCAPE '\\'`,
        'p."id" = ?',
        'b."id" = ?',
      ];
      params.push(search, like, like, search, search);
      // A booking code is "CS-" and the first 8 characters of the booking id.
      const code = search.replace(/^cs-?/i, '').toLowerCase();
      if (/^[0-9a-f]{4,8}$/.test(code)) {
        parts.push('b."id" LIKE ?');
        params.push(`${code}%`);
      }
      clauses.push(`(${parts.join(' OR ')})`);
    }
    if (query.channel.length) {
      clauses.push(`${CHANNEL} IN (${placeholders(query.channel.length)})`);
      params.push(...query.channel);
    }
    if (query.user.length) {
      clauses.push(`u."id" IN (${placeholders(query.user.length)})`);
      params.push(...query.user);
    }
    if (query.from) {
      clauses.push('p."createdAt" >= ?');
      params.push(sqlTime(startOfDayInZone(query.from, this.timeZone)));
    }
    if (query.to) {
      clauses.push('p."createdAt" < ?');
      params.push(sqlTime(dayRangeInZone(query.to, this.timeZone).end));
    }
    if (query.minAmount !== undefined) {
      clauses.push('p."amount" >= ?');
      params.push(query.minAmount);
    }
    if (query.maxAmount !== undefined) {
      clauses.push('p."amount" <= ?');
      params.push(query.maxAmount);
    }
    return { sql: clauses.join(' AND '), params };
  }

  private toDto(row: Row): AdminPaymentRow {
    const startsAt = fromSqlTime(row.startsAt);
    return {
      id: row.id,
      provider: row.provider,
      providerRef: row.providerRef,
      status: row.status,
      amount: row.amount,
      method: row.method || null,
      failureReason: row.failureReason,
      createdAt: fromSqlTime(row.createdAt).toISOString(),
      completedAt: row.completedAt ? fromSqlTime(row.completedAt).toISOString() : null,
      channel: row.channel,
      booking: { id: row.bookingId, code: bookingCode(row.bookingId), status: row.bookingStatus },
      buyer: { id: row.userId, name: row.userName, email: row.userEmail },
      show: {
        id: row.showId,
        startsAt: startsAt.toISOString(),
        date: dateInZone(startsAt, this.timeZone),
        time: timeInZone(startsAt, this.timeZone),
        movie: { id: row.movieId, title: row.title, genre: row.genre, posterPath: row.posterPath },
        theater: { id: row.theaterId, name: row.theaterName },
      },
    };
  }
}
