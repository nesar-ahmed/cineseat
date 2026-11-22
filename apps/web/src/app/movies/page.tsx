import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CatalogSkeleton, MoviesCatalog } from '../../features/movies/movies-catalog';

export const metadata: Metadata = {
  title: 'Movies — showtimes in Dhaka & Chattogram · CineSeat',
  description:
    'Browse what is showing and coming soon. Search by title, cast or genre, filter by cinema, date, language and format, and see showtimes with live availability.',
};

/** The catalog reads its filters from the URL, so it renders inside Suspense. */
export default function MoviesPage() {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <MoviesCatalog />
    </Suspense>
  );
}
