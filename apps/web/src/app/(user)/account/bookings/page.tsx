import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MyTickets } from '../../../../features/bookings/my-tickets';

export const metadata: Metadata = {
  title: 'My tickets — CineSeat',
  robots: { index: false, follow: false },
};

// The list reads its filter and page from the URL (?status=&page=).
export default function TicketsPage() {
  return (
    <div className="container-x py-8 sm:py-12">
      <Suspense fallback={null}>
        <MyTickets />
      </Suspense>
    </div>
  );
}
