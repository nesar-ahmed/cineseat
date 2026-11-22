import { Suspense } from 'react';
import type { Metadata } from 'next';
import { InvoicesList } from '../../../../features/invoices/invoices-list';

export const metadata: Metadata = {
  title: 'Invoices — CineSeat',
  robots: { index: false, follow: false },
};

// The list reads its filter and page from the URL (?status=&page=).
export default function InvoicesPage() {
  return (
    <div className="container-x py-8 sm:py-12">
      <Suspense fallback={null}>
        <InvoicesList />
      </Suspense>
    </div>
  );
}
