import { z } from 'zod';
import { csvList, ListQuerySchema, paginatedSchema, type Paginated } from './common';
import { Certificate, MovieStatus, ShowFormat } from './enums';

/** Calendar date `YYYY-MM-DD` that actually exists (no 2026-02-31). */
export const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Not a real calendar date');

/** Trimmed, de-duplicated list (case-insensitive), keeping the first spelling and order. */
const uniqueList = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).transform((items) => {
    const seen = new Set<string>();
    return items.filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

/**
 * A movie as the API returns it. `genre` is the primary genre (= `genres[0]`);
 * `releaseDate` is the release day in the cinemas' time zone; `rating`/`votes`
 * come from reviews, `interested` from watchlists and `popularity` from demand —
 * read-only for clients.
 */
export const MovieSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string().nullable(),
  description: z.string(),
  genre: z.string(),
  genres: z.array(z.string()),
  language: z.string(),
  durationMin: z.number().int().positive(),
  releaseDate: z.string(), // YYYY-MM-DD
  certificate: Certificate,
  formats: z.array(ShowFormat),
  director: z.string().nullable(),
  cast: z.array(z.string()),
  posterPath: z.string().nullable().optional(),
  trailerUrl: z.string().nullable().optional(),
  status: MovieStatus,
  /** Average audience score out of 5, or null before anyone has rated it. */
  rating: z.number().min(0).max(5).nullable(),
  votes: z.number().int().min(0),
  interested: z.number().int().min(0),
  popularity: z.number().int().min(0),
});
export type Movie = z.infer<typeof MovieSchema>;

export const PaginatedMoviesSchema = paginatedSchema(MovieSchema);

/** Poster uploads (POST /movies/:id/poster): the image types the API accepts, and the size limit. */
export const POSTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;
export type PaginatedMovies = Paginated<Movie>;

/** Editable fields, without defaults (so a partial update never resets anything). */
const MovieFields = {
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(160).nullable(),
  description: z.string().trim().min(10).max(2000),
  genres: uniqueList(z.string().trim().min(2).max(30)).pipe(z.array(z.string()).min(1).max(5)),
  language: z.string().trim().min(2).max(40),
  durationMin: z.number().int().min(1).max(600),
  releaseDate: CalendarDateSchema,
  certificate: Certificate,
  formats: uniqueList(ShowFormat).pipe(z.array(ShowFormat).min(1)),
  director: z.string().trim().min(2).max(80).nullable(),
  cast: uniqueList(z.string().trim().min(2).max(80)).pipe(z.array(z.string()).max(20)),
  trailerUrl: z
    .url({ protocol: /^https?$/ })
    .max(300)
    .nullable(),
  status: MovieStatus,
};

/** POST /movies (ADMIN). The poster is uploaded separately. */
export const CreateMovieSchema = z.object({
  ...MovieFields,
  tagline: MovieFields.tagline.optional().default(null),
  director: MovieFields.director.optional().default(null),
  trailerUrl: MovieFields.trailerUrl.optional().default(null),
  cast: MovieFields.cast.optional().default([]),
  formats: MovieFields.formats.optional().default(['2D']),
  certificate: MovieFields.certificate.optional().default('U'),
  status: MovieFields.status.optional().default('COMING_SOON'),
});
export type CreateMovieInput = z.infer<typeof CreateMovieSchema>;

/** PATCH /movies/:id (ADMIN) — only the fields that are sent change. */
export const UpdateMovieSchema = z
  .object(MovieFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateMovieInput = z.infer<typeof UpdateMovieSchema>;

export const MovieSort = z.enum(['popular', 'rating', 'release', 'title', 'runtime']);
export type MovieSort = z.infer<typeof MovieSort>;

/**
 * GET /movies and GET /catalog/facets. Options inside one list are OR-ed
 * ("Drama or Comedy"); different filters are AND-ed. `city`, `theater`, `date`
 * and `format` keep titles with an upcoming show that matches — they do not
 * apply to COMING_SOON titles, which have no shows yet.
 */
export const MovieListQuerySchema = ListQuerySchema.extend({
  status: MovieStatus.optional(),
  genre: csvList(z.string().trim().min(1).max(30)),
  language: csvList(z.string().trim().min(1).max(40)),
  certificate: csvList(Certificate),
  format: csvList(ShowFormat),
  city: z.string().trim().min(1).max(60).optional(),
  theater: csvList(z.string().trim().min(1).max(64)),
  /** Show date in the cinemas' time zone. */
  date: CalendarDateSchema.optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minDuration: z.coerce.number().int().min(1).max(600).optional(),
  maxDuration: z.coerce.number().int().min(1).max(600).optional(),
  sort: MovieSort.default('popular'),
}).refine(
  (query) => !query.minDuration || !query.maxDuration || query.minDuration <= query.maxDuration,
  {
    message: 'minDuration must not be greater than maxDuration',
    path: ['minDuration'],
  },
);
export type MovieListQuery = z.infer<typeof MovieListQuerySchema>;
