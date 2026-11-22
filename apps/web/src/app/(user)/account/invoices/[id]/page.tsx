import type { Metadata } from 'next';
import { InvoicePage } from '../../../../../features/invoices/invoice-page';

export const metadata: Metadata = {
  title: 'Invoice — CineSeat',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

/** One invoice, by the id of the booking it bills. Signed-in only (proxy.ts). */
export default async function InvoiceRoute({ params }: Props) {
  const { id } = await params;
  return (
    <div className="container-x py-8 sm:py-12 print:p-0">
      <InvoicePage key={id} id={id} />
    </div>
  );
}
