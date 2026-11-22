import { z } from 'zod';
import { csvList } from './common';
import { SeatCategory, ShowFormat, ShowSeatStatus } from './enums';
import { CalendarDateSchema } from './movies';

/** How full a show is, as people see it: colour and words in the UI. */
export const ShowAvailability = z.enum(['AVAILABLE', 'FILLING', 'ALMOST_FULL', 'SOLD_OUT']);
export type ShowAvailability = z.infer<typeof ShowAvailability>;

/** Price of one seat per category the screen has (minor units). */
export const SeatPricesSchema = z.object({
  STANDARD: z.number().int().min(0).optional(),
  PREMIUM: z.number().int().min(0).optional(),
  RECLINER: z.number().int().min(0).optional(),
});
export type SeatPrices = z.infer<typeof SeatPricesSchema>;

/**
 * One showtime. `startsAt`/`endsAt` are instants (ISO, UTC); `date` and `time`
 * are the same moment on the cinema's clock, ready to display. Money is in
 * minor units of `currency`.
 */
export const ShowtimeSchema = z.object({
  id: z.string(),
  movieId: z.string(),
  movieTitle: z.string(),
  theater: z.object({ id: z.string(), name: z.string(), city: z.string() }),
  screen: z.object({ id: z.string(), name: z.string() }),
  startsAt: z.string(),
  endsAt: z.string(),
  date: z.string(), // YYYY-MM-DD
  time: z.string(), // HH:MM, 24h
  language: z.string(),
  format: ShowFormat,
  currency: z.string(),
  priceFrom: z.number().int().min(0),
  prices: SeatPricesSchema,
  seats: z.object({ total: z.number().int().min(0), available: z.number().int().min(0) }),
  availability: ShowAvailability,
  /** False once the show has started or when no seat is left. */
  bookable: z.boolean(),
});
export type Showtime = z.infer<typeof ShowtimeSchema>;

/** GET /shows/:id — a showtime with what a booking page needs about the movie and venue. */
export const ShowDetailSchema = ShowtimeSchema.extend({
  movie: z.object({
    id: z.string(),
    title: z.string(),
    durationMin: z.number().int().positive(),
    certificate: z.string(),
    language: z.string(),
    posterPath: z.string().nullable(),
  }),
  theater: z.object({ id: z.string(), name: z.string(), city: z.string(), address: z.string() }),
});
export type ShowDetail = z.infer<typeof ShowDetailSchema>;

/**
 * GET /movies/:id/showtimes — a movie's schedule for the coming days: a count
 * per day (for the date strip) and every show, grouped by the client as it likes.
 */
export const MovieShowtimesSchema = z.object({
  movieId: z.string(),
  timeZone: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      shows: z.number().int().min(0),
      bookable: z.number().int().min(0),
    }),
  ),
  shows: z.array(ShowtimeSchema),
});
export type MovieShowtimes = z.infer<typeof MovieShowtimesSchema>;

export const MovieShowtimesQuerySchema = z.object({
  city: z.string().trim().min(1).max(60).optional(),
  theater: csvList(z.string().trim().min(1).max(64)),
  format: csvList(ShowFormat),
});
export type MovieShowtimesQuery = z.infer<typeof MovieShowtimesQuerySchema>;

/**
 * GET /shows. Without `date`, the window is from now to the end of the
 * schedule; with `date`, that whole day (started shows included, not bookable).
 */
export const ShowListQuerySchema = z.object({
  movie: csvList(z.string().trim().min(1).max(64)),
  theater: csvList(z.string().trim().min(1).max(64)),
  city: z.string().trim().min(1).max(60).optional(),
  date: CalendarDateSchema.optional(),
  format: csvList(ShowFormat),
  language: csvList(z.string().trim().min(1).max(40)),
});
export type ShowListQuery = z.infer<typeof ShowListQuerySchema>;

/** A seat in one show's map. Expired holds read as AVAILABLE. */
export const ShowSeatSchema = z.object({
  id: z.string(), // show-seat id: what a hold or booking refers to
  seatId: z.string(),
  row: z.number().int().positive(),
  number: z.number().int().positive(),
  label: z.string(),
  category: SeatCategory,
  status: ShowSeatStatus,
  price: z.number().int().min(0),
});
export type ShowSeat = z.infer<typeof ShowSeatSchema>;

/** GET /shows/:id/seats — the live seat map for one show. */
export const SeatMapSchema = z.object({
  showId: z.string(),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  currency: z.string(),
  prices: SeatPricesSchema,
  rules: z.object({
    holdMinutes: z.number().int().positive(),
    maxSeats: z.number().int().positive(),
  }),
  counts: z.object({
    available: z.number().int().min(0),
    held: z.number().int().min(0),
    booked: z.number().int().min(0),
  }),
  seats: z.array(ShowSeatSchema),
});
export type SeatMap = z.infer<typeof SeatMapSchema>;

const ShowFields = {
  startsAt: z.iso.datetime({ offset: true }),
  language: z.string().trim().min(2).max(40),
  format: ShowFormat,
  /** Standard-seat price in minor units; premium and recliner add their surcharge. */
  basePrice: z.number().int().min(0).max(10_000_000),
};

/** POST /shows (ADMIN). `language` defaults to the movie's. */
export const CreateShowSchema = z.object({
  movieId: z.string().trim().min(1),
  screenId: z.string().trim().min(1),
  ...ShowFields,
  language: ShowFields.language.optional(),
  format: ShowFields.format.optional().default('2D'),
});
export type CreateShowInput = z.infer<typeof CreateShowSchema>;

/** PATCH /shows/:id (ADMIN) — refused once seats are held or sold. */
export const UpdateShowSchema = z
  .object(ShowFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateShowInput = z.infer<typeof UpdateShowSchema>;
