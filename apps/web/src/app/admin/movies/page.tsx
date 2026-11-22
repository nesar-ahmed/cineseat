import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminMoviesPage } from '../../../features/admin/movies/movies-page';

export const metadata: Metadata = { title: 'Movies' };

// The list reads its whole view from the URL (?status=&q=&genre=&sort=&page=…).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminMoviesPage />
    </Suspense>
  );
}
