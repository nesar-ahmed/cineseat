import { z } from 'zod';
import {
  ADMIN_HISTORY_LIMIT,
  AdminHistoryEntrySchema,
  BulkIdsSchema,
  SortOrder,
} from './admin-common';
import { csvList, ListQuerySchema, paginatedSchema } from './common';
import { Certificate, SeatCategory, ShowFormat } from './enums';
import { CalendarDateSchema } from './movies';
import { SeatPricesSchema, ShowAvailability } from './shows';

/**
 * The showtimes module of the admin panel (ADMIN only).
 *
 * Reading: GET /admin/shows (every show, past and upcoming, with its sales) and
 * GET /admin/shows/:id (one show with seats per category, bookings, what can
 * still be done to it, and its history). Writing stays on the show resource:
 * POST /shows, POST /shows/batch (several dates × times at once, with a dry
 * run), PATCH/DELETE /shows/:id and POST /shows/bulk.
 *
 * Money is in poisha (৳1 = 100); instants are ISO UTC; `date` (`YYYY-MM-DD`)
 * and `time` (`HH:MM`) are on the cinemas' clock.
 */

/** Which part of the timeline: not started yet, today (cinema day), started already, or everything. */
export const AdminShowWhen = z.enum(['upcoming', 'today', 'past', 'all']);
export type AdminShowWhen = z.infer<typeof AdminShowWhen>;

export const AdminShowSort = z.enum([
  'startsAt',
  'movie',
  'theater',
  'sold',
  'occupancy',
  'revenue',
  'price',
]);
export type AdminShowSort = z.infer<typeof AdminShowSort>;

/**
 * The direction a sort starts in: the timeline runs forward (backward when
 * looking at the past), names A–Z, figures biggest first.
 */
export function defaultShowSortOrder(sort: AdminShowSort, when: AdminShowWhen): SortOrder {
  if (sort === 'startsAt') return when === 'past' ? 'desc' : 'asc';
  if (sort === 'movie' || sort === 'theater') return 'asc';
  return 'desc';
}

/** `sold`: at least one seat sold; `unsold`: none (such shows can still be changed or cancelled). */
export const AdminShowTicketsFilter = z.enum(['sold', 'unsold']);
export type AdminShowTicketsFilter = z.infer<typeof AdminShowTicketsFilter>;

/**
 * GET /admin/shows. Options inside one list are OR-ed, filters are AND-ed.
 * `from`/`to` narrow to cinema days (inclusive) on top of `when`.
 */
export const AdminShowListQuerySchema = ListQuerySchema.extend({
  when: AdminShowWhen.default('upcoming'),
  from: CalendarDateSchema.optional(),
  to: CalendarDateSchema.optional(),
  movie: csvList(z.string().trim().min(1).max(64)),
  theater: csvList(z.string().trim().min(1).max(64)),
  screen: csvList(z.string().trim().min(1).max(64)),
  city: csvList(z.string().trim().min(1).max(60)),
  format: csvList(ShowFormat),
  language: csvList(z.string().trim().min(1).max(40)),
  availability: csvList(ShowAvailability),
  tickets: AdminShowTicketsFilter.optional(),
  sort: AdminShowSort.default('startsAt'),
  /** Defaults to `defaultShowSortOrder(sort, when)`. */
  order: SortOrder.optional(),
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: 'from must not be after to',
  path: ['from'],
});
export type AdminShowListQuery = z.infer<typeof AdminShowListQuerySchema>;

/** Where a show is in time: not started, on screen now (start to end of film), or over. */
export const AdminShowState = z.enum(['UPCOMING', 'RUNNING', 'ENDED']);
export type AdminShowState = z.infer<typeof AdminShowState>;

/**
 * A show as the admin panel lists it. `seats.held` counts live holds only;
 * `revenue` is successful payments for its bookings. `locked`: it can no longer
 * be changed — it has started, or seats are sold or held.
 */
export const AdminShowSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  date: z.string(),
  time: z.string(),
  state: AdminShowState,
  movie: z.object({
    id: z.string(),
    title: z.string(),
    genre: z.string(),
    durationMin: z.number().int().positive(),
    certificate: Certificate,
    posterPath: z.string().nullable(),
  }),
  theater: z.object({ id: z.string(), name: z.string(), city: z.string() }),
  screen: z.object({ id: z.string(), name: z.string() }),
  format: ShowFormat,
  language: z.string(),
  currency: z.string(),
  /** Standard-seat price; `prices` has every category the screen has. */
  basePrice: z.number().int().min(0),
  prices: SeatPricesSchema,
  seats: z.object({
    total: z.number().int().min(0),
    sold: z.number().int().min(0),
    held: z.number().int().min(0),
    available: z.number().int().min(0),
  }),
  availability: ShowAvailability,
  /** Paid bookings. */
  bookings: z.number().int().min(0),
  revenue: z.number().int().min(0),
  locked: z.boolean(),
});
export type AdminShow = z.infer<typeof AdminShowSchema>;

/** GET /admin/shows answer: a page, plus how many shows each `when` tab holds with every other filter applied. */
export const AdminShowListSchema = paginatedSchema(AdminShowSchema).extend({
  counts: z.object({
    upcoming: z.number().int().min(0),
    today: z.number().int().min(0),
    past: z.number().int().min(0),
    all: z.number().int().min(0),
  }),
});
export type AdminShowList = z.infer<typeof AdminShowListSchema>;

/** GET /admin/shows/:id */
export const AdminShowDetailSchema = AdminShowSchema.extend({
  /** Seats per category the screen has, with the price each sells at. */
  seatsByCategory: z.array(
    z.object({
      category: SeatCategory,
      price: z.number().int().min(0),
      total: z.number().int().min(0),
      sold: z.number().int().min(0),
      held: z.number().int().min(0),
    }),
  ),
  bookingCounts: z.object({
    confirmed: z.number().int().min(0),
    /** Holds waiting for payment right now. */
    pending: z.number().int().min(0),
    /** Attempts that ended without a ticket (kept as history). */
    failed: z.number().int().min(0),
  }),
  /** The latest bookings, newest first (at most `ADMIN_SHOW_RECENT_BOOKINGS`). */
  recentBookings: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      status: z.string(),
      buyer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
      seats: z.array(z.string()),
      amount: z.number().int().min(0),
      createdAt: z.string(),
    }),
  ),
  constraints: z.object({
    /** Time, format, language and price can change until it starts or a seat is held or sold. */
    canEdit: z.boolean(),
    editBlockedReason: z.string().nullable(),
    /** Needs no tickets, no live holds and no booking attempts on record. */
    canDelete: z.boolean(),
    deleteBlockedReason: z.string().nullable(),
  }),
  history: z.array(AdminHistoryEntrySchema),
});
export type AdminShowDetail = z.infer<typeof AdminShowDetailSchema>;

export const ADMIN_SHOW_RECENT_BOOKINGS = 10;
export const ADMIN_SHOW_HISTORY_LIMIT = ADMIN_HISTORY_LIMIT;

/** `HH:MM`, 24-hour clock. */
export const ClockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM');

/** Shows one batch may create (dates × times). */
export const MAX_BATCH_SHOWS = 100;

const uniqueSorted = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).transform((items) => [...new Set(items)].sort());

/**
 * POST /shows/batch (ADMIN) — one movie on one screen at every `time` of every
 * `date` (cinema clock): "14:45 and 21:15, Friday to Sunday". Each show is
 * checked like a single one (future, released, formats, no overlap — with the
 * schedule and with the others in the batch). With `dryRun` nothing is saved:
 * the answer says what would happen.
 */
export const ScheduleShowsSchema = z
  .object({
    movieId: z.string().trim().min(1),
    screenId: z.string().trim().min(1),
    format: ShowFormat.optional().default('2D'),
    language: z.string().trim().min(2).max(40).optional(),
    basePrice: z.number().int().min(0).max(10_000_000),
    dates: uniqueSorted(CalendarDateSchema).pipe(z.array(z.string()).min(1).max(31)),
    times: uniqueSorted(ClockTimeSchema).pipe(z.array(z.string()).min(1).max(12)),
    dryRun: z.boolean().optional().default(false),
  })
  .refine((value) => value.dates.length * value.times.length <= MAX_BATCH_SHOWS, {
    message: `At most ${MAX_BATCH_SHOWS} shows at once (dates × times)`,
    path: ['times'],
  });
export type ScheduleShowsInput = z.infer<typeof ScheduleShowsSchema>;

export const ScheduleShowsResultSchema = z.object({
  dryRun: z.boolean(),
  /** Shows created (or, in a dry run, that would be). */
  created: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** One entry per date × time, earliest first. */
  results: z.array(
    z.object({
      date: z.string(),
      time: z.string(),
      startsAt: z.string(),
      /** The new show (null in a dry run, or when it failed). */
      showId: z.string().nullable(),
      /** Why it cannot be scheduled (`field: message`), or null. */
      error: z.string().nullable(),
    }),
  ),
});
export type ScheduleShowsResult = z.infer<typeof ScheduleShowsResultSchema>;

/** POST /shows/bulk (ADMIN) — cancel several shows, or give them a new base price. */
export const BulkShowActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), ids: BulkIdsSchema }),
  z.object({
    action: z.literal('price'),
    ids: BulkIdsSchema,
    basePrice: z.number().int().min(0).max(10_000_000),
  }),
]);
export type BulkShowActionInput = z.infer<typeof BulkShowActionSchema>;
