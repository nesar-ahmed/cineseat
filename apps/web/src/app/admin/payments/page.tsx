import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminPaymentsPage } from '../../../features/admin/payments/payments-page';

export const metadata: Metadata = { title: 'Payments' };

// The list reads its whole view from the URL (?status=&q=&channel=&user=&min=&page=…).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminPaymentsPage />
    </Suspense>
  );
}
