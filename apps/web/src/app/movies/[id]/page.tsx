import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withArt, type CatalogMovie } from '../../../features/catalog/art';
import { MovieDetails, type Selection } from '../../../features/movies/movie-details';
import { ApiClientError, getMovie } from '../../../lib/api';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Loaded =
  { status: 'found'; movie: CatalogMovie } | { status: 'missing' } | { status: 'unavailable' };

/**
 * One request per page render, shared by the metadata and the page. A movie the
 * API does not know is a real 404; an API that is down is not — the page then
 * loads the movie in the browser and offers a retry.
 */
const loadMovie = cache(async (id: string): Promise<Loaded> => {
  try {
    const movie = await getMovie(id, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return { status: 'found', movie: withArt(movie) };
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 400)) {
      return { status: 'missing' };
    }
    return { status: 'unavailable' };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await loadMovie(id);
  if (result.status === 'missing') return { title: 'Movie not found · CineSeat' };
  if (result.status === 'unavailable') return { title: 'Movie · CineSeat' };

  const { movie } = result;
  const title =
    movie.status === 'NOW_SHOWING'
      ? `${movie.title} — showtimes & tickets · CineSeat`
      : `${movie.title} — release date · CineSeat`;
  const description = clip([movie.tagline, movie.description].filter(Boolean).join(' '), 160);
  return {
    title,
    description,
    openGraph: { title, description, type: 'video.movie', siteName: 'CineSeat' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function MoviePage({ params, searchParams }: Props) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const result = await loadMovie(id);
  if (result.status === 'missing') notFound();

  return (
    <MovieDetails
      // A new movie starts from a clean slate (city, day, picked show).
      key={id}
      movieId={id}
      initialMovie={result.status === 'found' ? result.movie : null}
      initialSelection={parseSelection(search)}
    />
  );
}

/** `?city=…&date=…&show=…` from catalog links; malformed values are dropped. */
function parseSelection(search: Record<string, string | string[] | undefined>): Selection {
  const one = (key: string, max: number) => {
    const value = search[key];
    const text = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
    return text && text.length <= max ? text : null;
  };
  const date = one('date', 10);
  return {
    city: one('city', 60),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    show: one('show', 64),
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
