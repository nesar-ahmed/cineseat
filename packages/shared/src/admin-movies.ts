import { z } from 'zod';
import {
  ADMIN_HISTORY_LIMIT,
  AdminHistoryEntrySchema,
  AdminScheduleFilter,
  BulkIdsSchema,
  MAX_BULK_ITEMS,
  SortOrder,
} from './admin-common';
import { csvList, ListQuerySchema, paginatedSchema } from './common';
import { Certificate, MovieStatus, ShowFormat } from './enums';
import { CalendarDateSchema, MovieSchema } from './movies';

/**
 * The movies module of the admin panel (ADMIN only).
 *
 * Reading: GET /admin/movies (a page of titles with their business figures) and
 * GET /admin/movies/:id (one title with its schedule, what it can still be
 * changed to, and its edit history). Writing stays on the movie resource:
 * POST/PATCH/DELETE /movies, POST/DELETE /movies/:id/poster and
 * POST /movies/bulk.
 *
 * Money is in poisha (৳1 = 100); instants are ISO UTC; calendar days
 * (`YYYY-MM-DD`) are on the cinemas' clock.
 */

/** Columns the admin list can be ordered by. */
export const AdminMovieSort = z.enum([
  'updated',
  'created',
  'title',
  'release',
  'runtime',
  'popularity',
  'rating',
  'shows',
  'tickets',
  'revenue',
]);
export type AdminMovieSort = z.infer<typeof AdminMovieSort>;

/** The direction a sort starts in: A–Z for titles, biggest / newest first for the rest. */
export function defaultSortOrder(sort: AdminMovieSort): SortOrder {
  return sort === 'title' ? 'asc' : 'desc';
}

/** `scheduled`: has at least one show that has not started yet; `unscheduled`: has none. */
export const AdminMovieScheduleFilter = AdminScheduleFilter;
export type AdminMovieScheduleFilter = AdminScheduleFilter;

export const AdminMoviePosterFilter = z.enum(['with', 'without']);
export type AdminMoviePosterFilter = z.infer<typeof AdminMoviePosterFilter>;

/**
 * GET /admin/movies. Options inside one list are OR-ed, filters are AND-ed.
 * Unlike the public catalog, `format` is the formats a title is *released* in
 * (what can be scheduled), not the formats of its upcoming shows.
 */
export const AdminMovieListQuerySchema = ListQuerySchema.extend({
  status: MovieStatus.optional(),
  genre: csvList(z.string().trim().min(1).max(30)),
  language: csvList(z.string().trim().min(1).max(40)),
  certificate: csvList(Certificate),
  format: csvList(ShowFormat),
  schedule: AdminMovieScheduleFilter.optional(),
  poster: AdminMoviePosterFilter.optional(),
  /** Release day on or after (cinema calendar). */
  releasedFrom: CalendarDateSchema.optional(),
  /** Release day on or before (cinema calendar). */
  releasedTo: CalendarDateSchema.optional(),
  sort: AdminMovieSort.default('updated'),
  /** Defaults to `defaultSortOrder(sort)`. */
  order: SortOrder.optional(),
}).refine(
  (query) => !query.releasedFrom || !query.releasedTo || query.releasedFrom <= query.releasedTo,
  { message: 'releasedFrom must not be after releasedTo', path: ['releasedFrom'] },
);
export type AdminMovieListQuery = z.infer<typeof AdminMovieListQuerySchema>;

/**
 * What a title has done, all time. Tickets are seats sold on its shows; revenue
 * is successful payments for bookings of its shows (refunded money is not
 * revenue) — the same definitions as the dashboard.
 */
export const AdminMovieStatsSchema = z.object({
  /** Every show ever scheduled, past and upcoming. */
  shows: z.number().int().min(0),
  /** Shows that have not started yet. */
  upcomingShows: z.number().int().min(0),
  nextShowAt: z.string().nullable(),
  lastShowAt: z.string().nullable(),
  ticketsSold: z.number().int().min(0),
  revenue: z.number().int().min(0),
});
export type AdminMovieStats = z.infer<typeof AdminMovieStatsSchema>;

/** A movie as the admin panel lists it: the public shape plus record times and figures. */
export const AdminMovieSchema = MovieSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
  stats: AdminMovieStatsSchema,
});
export type AdminMovie = z.infer<typeof AdminMovieSchema>;

/**
 * GET /admin/movies answer: a page, plus how many titles each status tab holds
 * with every other filter applied (so the tabs can show counts).
 */
export const AdminMovieListSchema = paginatedSchema(AdminMovieSchema).extend({
  counts: z.object({
    all: z.number().int().min(0),
    NOW_SHOWING: z.number().int().min(0),
    COMING_SOON: z.number().int().min(0),
  }),
});
export type AdminMovieList = z.infer<typeof AdminMovieListSchema>;

/** One upcoming show of the title, with how full it is. */
export const AdminMovieShowSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  theater: z.string(),
  city: z.string(),
  screen: z.string(),
  format: ShowFormat,
  language: z.string(),
  sold: z.number().int().min(0),
  held: z.number().int().min(0),
  capacity: z.number().int().min(0),
});
export type AdminMovieShow = z.infer<typeof AdminMovieShowSchema>;

/**
 * How far the title can be edited without breaking its schedule. The API
 * enforces the same limits on PATCH /movies/:id (409 with the field named).
 */
export const AdminMovieConstraintsSchema = z.object({
  /** Only a title that never had a show can be deleted. */
  canDelete: z.boolean(),
  deleteBlockedReason: z.string().nullable(),
  /** Formats used by shows that have not started: they cannot be removed from `formats`. */
  formatsInUse: z.array(ShowFormat),
  /** The day of the first show that has not started: the release day cannot move past it. */
  latestReleaseDate: z.string().nullable(),
  /** Longest running time that still leaves every following show its turnaround; null = no limit. */
  maxDurationMin: z.number().int().min(0).nullable(),
});
export type AdminMovieConstraints = z.infer<typeof AdminMovieConstraintsSchema>;

/** One change recorded in the audit log: `create`, `update`, `poster`, `poster.remove` or `delete`. */
export const AdminMovieHistoryEntrySchema = AdminHistoryEntrySchema;
export type AdminMovieHistoryEntry = z.infer<typeof AdminMovieHistoryEntrySchema>;

/** GET /admin/movies/:id */
export const AdminMovieDetailSchema = AdminMovieSchema.extend({
  /** The next shows, soonest first (at most `ADMIN_MOVIE_UPCOMING_LIMIT`). */
  upcoming: z.array(AdminMovieShowSchema),
  constraints: AdminMovieConstraintsSchema,
  /** Latest changes first (at most `ADMIN_MOVIE_HISTORY_LIMIT`). */
  history: z.array(AdminMovieHistoryEntrySchema),
});
export type AdminMovieDetail = z.infer<typeof AdminMovieDetailSchema>;

export const ADMIN_MOVIE_UPCOMING_LIMIT = 8;
export const ADMIN_MOVIE_HISTORY_LIMIT = ADMIN_HISTORY_LIMIT;
/** Titles one bulk request may touch. */
export const MAX_BULK_MOVIES = MAX_BULK_ITEMS;

const BulkIds = BulkIdsSchema;

/** POST /movies/bulk — one action on several titles; each succeeds or fails on its own. */
export const BulkMovieActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), ids: BulkIds, status: MovieStatus }),
  z.object({ action: z.literal('delete'), ids: BulkIds }),
]);
export type BulkMovieActionInput = z.infer<typeof BulkMovieActionSchema>;

export const BulkMovieResultSchema = z.object({
  /** Ids the action was applied to (or that already were in the asked status). */
  succeeded: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), title: z.string().nullable(), message: z.string() })),
});
export type BulkMovieResult = z.infer<typeof BulkMovieResultSchema>;
