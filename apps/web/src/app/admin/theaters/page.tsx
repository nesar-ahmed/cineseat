import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminTheatersPage } from '../../../features/admin/theaters/theaters-page';

export const metadata: Metadata = { title: 'Theaters' };

// The list reads its whole view from the URL (?city=&q=&amenity=&sort=&page=…).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminTheatersPage />
    </Suspense>
  );
}
