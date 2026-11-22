import { Suspense } from 'react';
import type { Metadata } from 'next';
import { NotificationsPage } from '../../../../features/notifications/notifications-page';

export const metadata: Metadata = {
  title: 'Notifications — CineSeat',
  robots: { index: false, follow: false },
};

// The list reads its view and page from the URL (?view=unread|bookings|offers|account&page=2).
export default function Page() {
  return (
    <div className="container-x py-8 sm:py-12">
      <Suspense fallback={null}>
        <NotificationsPage />
      </Suspense>
    </div>
  );
}
