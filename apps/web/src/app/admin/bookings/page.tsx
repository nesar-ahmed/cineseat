import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminBookingsPage } from '../../../features/admin/bookings/bookings-page';

export const metadata: Metadata = { title: 'Bookings' };

// The list reads its whole view from the URL (?status=&q=&payment=&show=&user=&page=…).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminBookingsPage />
    </Suspense>
  );
}
