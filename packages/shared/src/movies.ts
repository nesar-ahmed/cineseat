import { z } from 'zod';
import { MovieStatus, ShowFormat } from './enums';

export const MovieSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  language: z.string(),
  durationMin: z.number().int().positive(),
  releaseDate: z.string(), // ISO string, because JSON has no Date
  posterPath: z.string().nullable().optional(),
  trailerUrl: z.string().nullable().optional(),
  status: MovieStatus,
});
export type Movie = z.infer<typeof MovieSchema>;

export const CreateMovieSchema = MovieSchema.omit({ id: true });
export type CreateMovieInput = z.infer<typeof CreateMovieSchema>;

export const UpdateMovieSchema = CreateMovieSchema.partial();
export type UpdateMovieInput = z.infer<typeof UpdateMovieSchema>;

export const ShowSchema = z.object({
  id: z.string(),
  movieId: z.string(),
  screenId: z.string(),
  theaterName: z.string(),
  city: z.string(),
  startsAt: z.string(), // ISO string
  language: z.string(),
  format: ShowFormat,
  basePrice: z.number().int().min(0), // money as integer (poisha/cents)
});
export type Show = z.infer<typeof ShowSchema>;
