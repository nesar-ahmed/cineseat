import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminUsersPage } from '../../../features/admin/users/users-page';

export const metadata: Metadata = { title: 'Users' };

// The list reads its whole view from the URL (?role=&q=&activity=&sort=&page=…).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminUsersPage />
    </Suspense>
  );
}
