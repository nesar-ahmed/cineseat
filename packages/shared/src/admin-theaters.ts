import { z } from 'zod';
import { AdminHistoryEntrySchema, AdminScheduleFilter, SortOrder } from './admin-common';
import { AdminShowSchema } from './admin-shows';
import { csvList, ListQuerySchema, paginatedSchema } from './common';
import { ShowFormat } from './enums';
import { SeatCountsSchema } from './theaters';

/**
 * The theaters module of the admin panel (ADMIN only).
 *
 * Reading: GET /admin/theaters (every cinema with its screens and figures) and
 * GET /admin/theaters/:id (one cinema with each screen's figures and limits,
 * its next shows and its history — screens included). Writing stays on the
 * resources: POST/PATCH/DELETE /theaters, POST /theaters/:id/screens,
 * PATCH/DELETE /screens/:id.
 *
 * Money is in poisha (৳1 = 100); instants are ISO UTC.
 */

export const AdminTheaterSort = z.enum([
  'city',
  'name',
  'screens',
  'seats',
  'shows',
  'tickets',
  'revenue',
  'occupancy',
]);
export type AdminTheaterSort = z.infer<typeof AdminTheaterSort>;

/** A–Z for names and cities, biggest first for figures. */
export function defaultTheaterSortOrder(sort: AdminTheaterSort): SortOrder {
  return sort === 'city' || sort === 'name' ? 'asc' : 'desc';
}

/** GET /admin/theaters. Options inside one list are OR-ed, filters are AND-ed. */
export const AdminTheaterListQuerySchema = ListQuerySchema.extend({
  city: csvList(z.string().trim().min(1).max(60)),
  /** Offers any of these amenities (case-insensitive). */
  amenity: csvList(z.string().trim().min(1).max(40)),
  /** Has a screen that can show any of these formats. */
  format: csvList(ShowFormat),
  schedule: AdminScheduleFilter.optional(),
  /** `city` sorts by city, then name. */
  sort: AdminTheaterSort.default('city'),
  /** Defaults to `defaultTheaterSortOrder(sort)`. */
  order: SortOrder.optional(),
});
export type AdminTheaterListQuery = z.infer<typeof AdminTheaterListQuerySchema>;

/**
 * Seats sold over seats on sale, for shows that have not started yet — how
 * full the coming schedule is.
 */
export const OccupancySchema = z.object({
  sold: z.number().int().min(0),
  capacity: z.number().int().min(0),
});
export type Occupancy = z.infer<typeof OccupancySchema>;

/** All-time figures of a theater or a screen (tickets = seats sold; revenue = successful payments). */
export const AdminVenueStatsSchema = z.object({
  shows: z.number().int().min(0),
  upcomingShows: z.number().int().min(0),
  nextShowAt: z.string().nullable(),
  ticketsSold: z.number().int().min(0),
  revenue: z.number().int().min(0),
  occupancy: OccupancySchema,
});
export type AdminVenueStats = z.infer<typeof AdminVenueStatsSchema>;

/** A screen in one line, for lists and pickers (scheduling a show needs screen and formats). */
export const AdminScreenBriefSchema = z.object({
  id: z.string(),
  name: z.string(),
  formats: z.array(ShowFormat),
  seats: z.number().int().min(0),
});
export type AdminScreenBrief = z.infer<typeof AdminScreenBriefSchema>;

/** A cinema as the admin panel lists it. `formats`: what at least one of its screens can show. */
export const AdminTheaterSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  amenities: z.array(z.string()),
  formats: z.array(ShowFormat),
  screens: z.array(AdminScreenBriefSchema),
  seatCount: z.number().int().min(0),
  /** Today in the cinemas' time zone. */
  today: z.object({ shows: z.number().int().min(0), movies: z.number().int().min(0) }),
  stats: AdminVenueStatsSchema,
});
export type AdminTheater = z.infer<typeof AdminTheaterSchema>;

/** GET /admin/theaters answer: a page, plus cinemas per city with every other filter applied (for city tabs). */
export const AdminTheaterListSchema = paginatedSchema(AdminTheaterSchema).extend({
  counts: z.object({
    all: z.number().int().min(0),
    cities: z.array(z.object({ city: z.string(), count: z.number().int().min(0) })),
  }),
});
export type AdminTheaterList = z.infer<typeof AdminTheaterListSchema>;

/**
 * A screen with what an admin needs to edit it: its layout as it was entered
 * (rows, cols, premium and recliner rows), its figures, and what its shows
 * still allow. The API enforces the same limits on PATCH/DELETE /screens/:id.
 */
export const AdminScreenSchema = z.object({
  id: z.string(),
  name: z.string(),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  premiumRows: z.number().int().min(0),
  reclinerRows: z.number().int().min(0),
  formats: z.array(ShowFormat),
  seatCounts: SeatCountsSchema,
  stats: AdminVenueStatsSchema,
  constraints: z.object({
    /** Only a screen that never had a show can be deleted. */
    canDelete: z.boolean(),
    deleteBlockedReason: z.string().nullable(),
    /** Every show has its own copy of the seats, so the layout is fixed once shows exist. */
    layoutLocked: z.boolean(),
    layoutLockedReason: z.string().nullable(),
    /** Formats used by shows that have not started: they cannot be removed. */
    formatsInUse: z.array(ShowFormat),
  }),
});
export type AdminScreen = z.infer<typeof AdminScreenSchema>;

/** GET /admin/theaters/:id */
export const AdminTheaterDetailSchema = AdminTheaterSchema.omit({ screens: true }).extend({
  screens: z.array(AdminScreenSchema),
  /** The next shows across its screens, soonest first (at most `ADMIN_THEATER_UPCOMING_LIMIT`). */
  upcoming: z.array(AdminShowSchema),
  constraints: z.object({
    /** Only a theater none of whose screens ever had a show can be deleted. */
    canDelete: z.boolean(),
    deleteBlockedReason: z.string().nullable(),
  }),
  /** Changes to the theater and its screens, latest first. */
  history: z.array(AdminHistoryEntrySchema),
});
export type AdminTheaterDetail = z.infer<typeof AdminTheaterDetailSchema>;

export const ADMIN_THEATER_UPCOMING_LIMIT = 8;
