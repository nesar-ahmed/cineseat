import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminShowsPage } from '../../../features/admin/shows/shows-page';

export const metadata: Metadata = { title: 'Showtimes' };

// The page reads its whole view from the URL (?view=&when=&theater=&movie=&day=…).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminShowsPage />
    </Suspense>
  );
}
