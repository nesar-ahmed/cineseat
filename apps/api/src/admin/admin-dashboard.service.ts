import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CURRENCY, type AdminDashboard, type Trend } from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import { addDays, dateInZone, dayRangeInZone, startOfDayInZone } from '../common/time/zoned-time';
import { fromSqlTime, sqlTime } from '../database/inventory-lane';

const DAY = 24 * 60 * 60 * 1000;
/** KPIs compare the last WINDOW_DAYS with the WINDOW_DAYS before. */
export const WINDOW_DAYS = 7;
/** Days in the sales chart, today included. */
export const CHART_DAYS = 14;
const UPCOMING_SHOWS = 6;
const RECENT_BOOKINGS = 8;
const TOP_MOVIES = 5;

type SaleRow = {
  bookingId: string;
  amount: number;
  completedAt: string;
  movieId: string;
  title: string;
  seats: number;
};

/**
 * The numbers on the admin panel's home. Read-only: plain queries, no lane —
 * a dashboard a moment out of date is fine, and it never blocks a booking.
 *
 * Sales are successful payments (revenue = their amounts, tickets = the seats
 * of the bookings they paid); refunds are reported apart and are not revenue.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async dashboard(now: Date = new Date()): Promise<AdminDashboard> {
    const timeZone = this.config.getOrThrow<string>('timeZone');
    const today = dateInZone(now, timeZone);
    const weekAgo = new Date(now.getTime() - WINDOW_DAYS * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY);
    const chartDays = Array.from({ length: CHART_DAYS }, (_, i) =>
      addDays(today, i - (CHART_DAYS - 1)),
    );
    const chartStart = startOfDayInZone(chartDays[0], timeZone);
    const salesFrom = chartStart < twoWeeksAgo ? chartStart : twoWeeksAgo;

    const [sales, signups, totalUsers, occupancy, holds, refunds, showsToday, upcoming, recent] =
      await Promise.all([
        this.sales(salesFrom, now),
        this.rows<{ createdAt: string }>(
          `SELECT "createdAt" FROM "users" WHERE "role" = 'USER' AND "createdAt" > ? AND "createdAt" <= ?`,
          sqlTime(twoWeeksAgo),
          sqlTime(now),
        ),
        this.count(`SELECT COUNT(*) AS "n" FROM "users" WHERE "role" = 'USER'`),
        this.one<{ capacity: number; sold: number | null }>(
          `SELECT COUNT(*) AS "capacity", SUM(ss."status" = 'BOOKED') AS "sold"
           FROM "show_seats" ss JOIN "shows" s ON s."id" = ss."showId"
           WHERE s."startsAt" > ? AND s."startsAt" <= ?`,
          sqlTime(now),
          sqlTime(new Date(now.getTime() + WINDOW_DAYS * DAY)),
        ),
        this.count(
          `SELECT COUNT(*) AS "n" FROM "bookings" WHERE "status" = 'PENDING' AND "expiresAt" > ?`,
          sqlTime(now),
        ),
        this.one<{ count: number; amount: number | null }>(
          `SELECT COUNT(*) AS "count", SUM("amount") AS "amount" FROM "payments"
           WHERE "status" = 'REFUNDED' AND "completedAt" > ? AND "completedAt" <= ?`,
          sqlTime(weekAgo),
          sqlTime(now),
        ),
        this.showsOn(today, timeZone),
        this.upcomingShows(now),
        this.recentBookings(now),
      ]);

    // One pass over the sales of the last two weeks feeds the KPIs, the chart and the top list.
    const revenue: Trend = { current: 0, previous: 0 };
    const tickets: Trend = { current: 0, previous: 0 };
    const bookings: Trend = { current: 0, previous: 0 };
    const byDay = new Map(chartDays.map((date) => [date, { date, revenue: 0, tickets: 0 }]));
    const byMovie = new Map<
      string,
      { id: string; title: string; tickets: number; revenue: number }
    >();
    for (const sale of sales) {
      const at = fromSqlTime(sale.completedAt);
      const window = at > weekAgo ? 'current' : at > twoWeeksAgo ? 'previous' : null;
      if (window) {
        revenue[window] += sale.amount;
        tickets[window] += sale.seats;
        bookings[window] += 1;
      }
      if (window === 'current') {
        const movie = byMovie.get(sale.movieId) ?? {
          id: sale.movieId,
          title: sale.title,
          tickets: 0,
          revenue: 0,
        };
        movie.tickets += sale.seats;
        movie.revenue += sale.amount;
        byMovie.set(sale.movieId, movie);
      }
      const day = byDay.get(dateInZone(at, timeZone));
      if (day) {
        day.revenue += sale.amount;
        day.tickets += sale.seats;
      }
    }

    const newUsers: Trend = { current: 0, previous: 0 };
    for (const { createdAt } of signups) {
      if (fromSqlTime(createdAt) > weekAgo) newUsers.current += 1;
      else newUsers.previous += 1;
    }

    return {
      generatedAt: now.toISOString(),
      today,
      currency: CURRENCY,
      kpis: {
        revenue,
        ticketsSold: tickets,
        bookings,
        newUsers,
        totalUsers,
        occupancy: { sold: occupancy?.sold ?? 0, capacity: occupancy?.capacity ?? 0 },
        activeHolds: holds,
        refunds: { count: refunds?.count ?? 0, amount: refunds?.amount ?? 0 },
        showsToday,
      },
      salesByDay: [...byDay.values()],
      upcomingShows: upcoming,
      recentBookings: recent,
      topMovies: [...byMovie.values()]
        .sort((a, b) => b.revenue - a.revenue || b.tickets - a.tickets)
        .slice(0, TOP_MOVIES),
    };
  }

  /** Successful payments completed in (from, to], with what they paid for. */
  private sales(from: Date, to: Date): Promise<SaleRow[]> {
    return this.rows<SaleRow>(
      `SELECT p."bookingId", p."amount", p."completedAt", s."movieId", m."title",
              (SELECT COUNT(*) FROM "booking_seats" bs
               WHERE bs."bookingId" = p."bookingId" AND bs."releasedAt" IS NULL) AS "seats"
       FROM "payments" p
       JOIN "bookings" b ON b."id" = p."bookingId"
       JOIN "shows" s ON s."id" = b."showId"
       JOIN "movies" m ON m."id" = s."movieId"
       WHERE p."status" = 'SUCCESS' AND p."completedAt" > ? AND p."completedAt" <= ?`,
      sqlTime(from),
      sqlTime(to),
    );
  }

  private showsOn(date: string, timeZone: string): Promise<number> {
    const { start, end } = dayRangeInZone(date, timeZone);
    return this.count(
      `SELECT COUNT(*) AS "n" FROM "shows" WHERE "startsAt" >= ? AND "startsAt" < ?`,
      sqlTime(start),
      sqlTime(end),
    );
  }

  private async upcomingShows(now: Date): Promise<AdminDashboard['upcomingShows']> {
    const rows = await this.rows<{
      id: string;
      movieTitle: string;
      theater: string;
      screen: string;
      startsAt: string;
      format: string;
      sold: number | null;
      held: number | null;
      capacity: number;
    }>(
      `SELECT s."id", m."title" AS "movieTitle", t."name" AS "theater", sc."name" AS "screen",
              s."startsAt", s."format",
              SUM(ss."status" = 'BOOKED') AS "sold",
              SUM(ss."status" = 'HELD' AND ss."holdExpiresAt" > ?) AS "held",
              COUNT(ss."id") AS "capacity"
       FROM "shows" s
       JOIN "movies" m ON m."id" = s."movieId"
       JOIN "screens" sc ON sc."id" = s."screenId"
       JOIN "theaters" t ON t."id" = sc."theaterId"
       LEFT JOIN "show_seats" ss ON ss."showId" = s."id"
       WHERE s."startsAt" > ?
       GROUP BY s."id"
       ORDER BY s."startsAt" ASC, t."name" ASC, sc."name" ASC
       LIMIT ${UPCOMING_SHOWS}`,
      sqlTime(now),
      sqlTime(now),
    );
    return rows.map((row) => ({
      ...row,
      startsAt: fromSqlTime(row.startsAt).toISOString(),
      sold: row.sold ?? 0,
      held: row.held ?? 0,
    }));
  }

  private async recentBookings(now: Date): Promise<AdminDashboard['recentBookings']> {
    const rows = await this.rows<{
      id: string;
      buyerName: string;
      buyerEmail: string;
      movieTitle: string;
      seats: number;
      amount: number;
      paidAt: string;
    }>(
      `SELECT b."id", u."name" AS "buyerName", u."email" AS "buyerEmail", m."title" AS "movieTitle",
              (SELECT COUNT(*) FROM "booking_seats" bs
               WHERE bs."bookingId" = b."id" AND bs."releasedAt" IS NULL) AS "seats",
              p."amount", p."completedAt" AS "paidAt"
       FROM "payments" p
       JOIN "bookings" b ON b."id" = p."bookingId"
       JOIN "users" u ON u."id" = b."userId"
       JOIN "shows" s ON s."id" = b."showId"
       JOIN "movies" m ON m."id" = s."movieId"
       WHERE p."status" = 'SUCCESS' AND p."completedAt" <= ?
       ORDER BY p."completedAt" DESC
       LIMIT ${RECENT_BOOKINGS}`,
      sqlTime(now),
    );
    return rows.map((row) => ({
      ...row,
      code: bookingCode(row.id),
      paidAt: fromSqlTime(row.paidAt).toISOString(),
    }));
  }

  private rows<T>(sql: string, ...params: (string | number)[]): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }

  private async one<T>(sql: string, ...params: (string | number)[]): Promise<T | undefined> {
    return (await this.rows<T>(sql, ...params))[0];
  }

  private async count(sql: string, ...params: (string | number)[]): Promise<number> {
    return (await this.one<{ n: number }>(sql, ...params))?.n ?? 0;
  }
}
