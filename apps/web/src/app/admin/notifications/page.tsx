import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminNotificationsPage } from '../../../features/admin/notifications/admin-notifications-page';

export const metadata: Metadata = { title: 'Notifications' };

// The inbox reads its view and page from the URL (?view=unread|sales|signups|alerts&page=2).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminNotificationsPage />
    </Suspense>
  );
}
