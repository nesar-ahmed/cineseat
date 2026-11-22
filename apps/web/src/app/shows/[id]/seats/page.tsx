import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MAX_SEATS_PER_BOOKING, type ShowDetail } from '@cineseat/shared';
import { withArt, type CatalogMovie } from '../../../../features/catalog/art';
import { dayInfo, time12 } from '../../../../features/catalog/format';
import { SeatPicker } from '../../../../features/seats/seat-picker';
import { ShowUnavailable } from '../../../../features/seats/show-unavailable';
import { ApiClientError, getMovie, getShow } from '../../../../lib/api';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Loaded =
  | { status: 'found'; show: ShowDetail; movie: CatalogMovie }
  | { status: 'missing' }
  | { status: 'unavailable' };

/** The show and its movie (for the artwork), once per render; an unknown show is a real 404. */
const loadShow = cache(async (id: string): Promise<Loaded> => {
  const init = { cache: 'no-store', signal: AbortSignal.timeout(5000) } as const;
  try {
    const show = await getShow(id, init);
    const movie = await getMovie(show.movie.id, init);
    return { status: 'found', show, movie: withArt(movie) };
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 400)) {
      return { status: 'missing' };
    }
    return { status: 'unavailable' };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await loadShow((await params).id);
  // Seat maps change by the second and belong to one showtime: keep them out of search.
  const robots = { index: false, follow: true };
  if (result.status !== 'found') return { title: 'Showtime · CineSeat', robots };
  const { show, movie } = result;
  return {
    title: `Seats for ${movie.title} — ${dayInfo(show.date).long}, ${time12(show.time)} · CineSeat`,
    description: `Pick your seats for ${movie.title} at ${show.theater.name}, ${show.screen.name}.`,
    robots,
  };
}

export default async function SeatsPage({ params, searchParams }: Props) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const result = await loadShow(id);
  if (result.status === 'missing') notFound();
  if (result.status === 'unavailable') return <ShowUnavailable reason="unreachable" />;

  return (
    <SeatPicker
      // Another showtime starts from a clean slate.
      key={id}
      show={result.show}
      movie={result.movie}
      initialSeats={parseSeats(search.seats)}
    />
  );
}

/** `?seats=a,b` — seats picked before signing in; the seat map decides which are still free. */
function parseSeats(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 64);
  return [...new Set(ids)].slice(0, MAX_SEATS_PER_BOOKING);
}
