'use client';

import Link from 'next/link';
import { InfoIcon, PrinterIcon, TicketIcon } from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { ACCOUNT_ROUTES } from '../account/links';
import { PanelHeader } from '../account/panel-header';
import { bookingHref } from '../bookings/queries';
import { invoiceDate, invoiceMoney, STATUS_BADGE, STATUS_LABEL } from './format';
import { InvoiceDocument } from './invoice-document';
import { isMissing, useInvoice } from './queries';

/**
 * One invoice (`/account/invoices/:id`, the id of the booking it bills): the
 * printable document, with a way to print or save it and back to the ticket.
 * Everything but the document hides itself on paper.
 */
export function InvoicePage({ id }: { id: string }) {
  return useHydrated() ? <Loaded id={id} /> : <Skeleton />;
}

function Loaded({ id }: { id: string }) {
  const query = useInvoice(id);

  if (query.isPending) return <Skeleton />;
  if (!query.data) {
    const missing = isMissing(query.error);
    return (
      <div className="flex flex-col gap-6">
        <PanelHeader
          trail={[
            { label: 'My account', href: ACCOUNT_ROUTES.overview },
            { label: 'Invoices', href: ACCOUNT_ROUTES.invoices },
            { label: 'Not found' },
          ]}
          eyebrow="Invoice"
          title={missing ? 'Invoice not found' : 'Couldn’t load this invoice'}
        />
        <div className="card flex max-w-2xl flex-col gap-4 rounded-3xl p-6 sm:p-8">
          <p className="flex items-start gap-3 text-sm text-ink-300">
            <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
            <span>
              {missing
                ? 'There is no invoice for this booking in your account. A booking gets one once its payment goes through.'
                : (query.error?.message ?? 'Please try again.')}
            </span>
          </p>
          <div className="flex flex-wrap gap-3">
            {missing ? (
              <Link href={bookingHref(id)} className="btn-primary">
                Open the booking
              </Link>
            ) : (
              <button type="button" onClick={() => void query.refetch()} className="btn-primary">
                Try again
              </button>
            )}
            <Link href={ACCOUNT_ROUTES.invoices} className="btn-ghost">
              All invoices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const invoice = query.data;
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="print:hidden">
        <PanelHeader
          trail={[
            { label: 'My account', href: ACCOUNT_ROUTES.overview },
            { label: 'Invoices', href: ACCOUNT_ROUTES.invoices },
            { label: invoice.number, mono: true },
          ]}
          eyebrow="Invoice"
          title={<span className="font-mono tracking-tight">{invoice.number}</span>}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[invoice.status]}`}
              >
                {STATUS_LABEL[invoice.status]}
              </span>
              <span>
                {invoice.show.movie.title} · issued {invoiceDate(invoice.issuedAt)} ·{' '}
                {invoiceMoney(invoice.total, invoice.currency)}
              </span>
            </span>
          }
          actions={
            <>
              <Link href={bookingHref(invoice.bookingId)} className="btn-ghost">
                <TicketIcon className="h-4 w-4" />
                View ticket
              </Link>
              <button type="button" onClick={() => window.print()} className="btn-primary">
                <PrinterIcon className="h-4 w-4" />
                Print or save PDF
              </button>
            </>
          }
        />
      </div>

      <div className="mx-auto w-full max-w-4xl print:max-w-none">
        <InvoiceDocument invoice={invoice} />
        <p className="mt-4 text-center text-xs text-ink-500 print:hidden">
          To keep a copy, choose “Save as PDF” as the printer.
        </p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading the invoice</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="h-4 w-56 rounded bg-white/[0.06]" />
        <div className="h-10 w-72 max-w-full rounded-xl bg-white/[0.06]" />
      </div>
      <div
        aria-hidden="true"
        className="mx-auto mt-8 h-[40rem] max-w-4xl rounded-3xl bg-white/[0.05]"
      />
    </div>
  );
}
