import { z } from 'zod';

/**
 * Admin dashboard (GET /admin/dashboard, ADMIN only): one answer with what the
 * admin panel's home shows. Money is in poisha (৳1 = 100), instants are ISO UTC
 * and calendar days (`YYYY-MM-DD`) are on the cinemas' clock.
 *
 * "Sales" are payments that succeeded: revenue is their amount, tickets are the
 * seats of the bookings they paid for. Refunded money is not revenue.
 */

/** A figure for the last 7 days next to the 7 days before, for the trend arrow. */
const TrendSchema = z.object({
  current: z.number().int().min(0),
  previous: z.number().int().min(0),
});
export type Trend = z.infer<typeof TrendSchema>;

export const AdminDashboardSchema = z.object({
  generatedAt: z.string(),
  /** The cinemas' date "today" (`YYYY-MM-DD`). */
  today: z.string(),
  currency: z.string(),
  kpis: z.object({
    /** Successful payments, last 7 days vs the 7 before. */
    revenue: TrendSchema,
    ticketsSold: TrendSchema,
    bookings: TrendSchema,
    /** Accounts created (role USER). */
    newUsers: TrendSchema,
    totalUsers: z.number().int().min(0),
    /** Seats sold across shows starting in the next 7 days. */
    occupancy: z.object({
      sold: z.number().int().min(0),
      capacity: z.number().int().min(0),
    }),
    /** Holds live right now (seats reserved, payment not finished). */
    activeHolds: z.number().int().min(0),
    /** Money sent back in the last 7 days (late or duplicate payments). */
    refunds: z.object({ count: z.number().int().min(0), amount: z.number().int().min(0) }),
    showsToday: z.number().int().min(0),
  }),
  /** One entry per cinema day, oldest first (14 days, today last). */
  salesByDay: z.array(
    z.object({
      date: z.string(),
      revenue: z.number().int().min(0),
      tickets: z.number().int().min(0),
    }),
  ),
  /** The next shows to start, soonest first. */
  upcomingShows: z.array(
    z.object({
      id: z.string(),
      movieTitle: z.string(),
      theater: z.string(),
      screen: z.string(),
      startsAt: z.string(),
      format: z.string(),
      sold: z.number().int().min(0),
      held: z.number().int().min(0),
      capacity: z.number().int().min(0),
    }),
  ),
  /** The latest paid bookings, newest first. */
  recentBookings: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      buyerName: z.string(),
      buyerEmail: z.string(),
      movieTitle: z.string(),
      seats: z.number().int().min(0),
      amount: z.number().int().min(0),
      paidAt: z.string(),
    }),
  ),
  /** Best sellers of the last 7 days, by revenue. */
  topMovies: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tickets: z.number().int().min(0),
      revenue: z.number().int().min(0),
    }),
  ),
});
export type AdminDashboard = z.infer<typeof AdminDashboardSchema>;
