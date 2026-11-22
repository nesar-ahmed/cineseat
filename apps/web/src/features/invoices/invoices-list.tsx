'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { InvoiceStatus, type InvoiceSummary } from '@cineseat/shared';
import { ChevronRightIcon, ReceiptIcon } from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { ACCOUNT_ROUTES, invoiceHref } from '../account/links';
import { FilterBar, FilterPill, Pagination, pageParam } from '../account/list-controls';
import { PanelHeader } from '../account/panel-header';
import { useInvoiceCount, useInvoices } from './queries';
import { invoiceAmount, invoiceDate, invoiceMoney, STATUS_BADGE, STATUS_LABEL } from './format';

type Filter = { status?: InvoiceStatus; label: string };
const FILTERS: Filter[] = [
  { label: 'All' },
  { status: 'PAID', label: 'Paid' },
  { status: 'REFUNDED', label: 'Refunded' },
];

/**
 * Invoices (`/account/invoices`): one per booking that money reached, newest
 * first (GET /invoices). A table on wide screens, cards on phones; status and
 * page live in the URL (`?status=&page=`). Each opens its printable invoice.
 */
export function InvoicesList() {
  const params = useSearchParams();
  const status = InvoiceStatus.safeParse(params.get('status')).data;
  const page = pageParam(params.get('page'));
  const active = FILTERS.find((filter) => filter.status === status) ?? FILTERS[0];
  const hydrated = useHydrated();

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PanelHeader
        trail={[{ label: 'My account', href: ACCOUNT_ROUTES.overview }, { label: 'Invoices' }]}
        eyebrow="Billing"
        title="Invoices"
        description="A receipt for every booking you paid for — open one to print it or save it as a PDF."
      />
      {hydrated ? (
        <>
          <FilterBar label="Filter invoices">
            {FILTERS.map((filter) => (
              <StatusPill key={filter.label} filter={filter} active={filter === active} />
            ))}
          </FilterBar>
          <InvoiceTable filter={active} page={page} />
        </>
      ) : (
        <ListSkeleton />
      )}
    </div>
  );
}

function StatusPill({ filter, active }: { filter: Filter; active: boolean }) {
  const count = useInvoiceCount(filter.status).data?.total;
  // Refunds are rare: the pill only shows up once there is one (or it is open).
  if (filter.status === 'REFUNDED' && !active && (count ?? 0) === 0) return null;
  return (
    <FilterPill
      href={hrefFor(filter.status, 1)}
      label={filter.label}
      count={count}
      active={active}
    />
  );
}

function InvoiceTable({ filter, page }: { filter: Filter; page: number }) {
  const query = useInvoices(page, filter.status);

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) {
    return (
      <div className="card rounded-3xl p-8 text-center">
        <p className="font-display text-xl text-ink-50">Couldn’t load your invoices</p>
        <p className="mt-2 text-sm text-ink-400">{query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    );
  }

  const { items, total, pageSize } = query.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return <EmptyState filter={filter} />;
  if (items.length === 0) {
    return (
      <div className="card rounded-3xl p-8 text-center">
        <p className="font-display text-xl text-ink-50">Nothing on page {page}</p>
        <Link href={hrefFor(filter.status, 1)} className="btn-primary mt-6">
          Go to the first page
        </Link>
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = from + items.length - 1;
  return (
    <section aria-labelledby="invoices-title" aria-busy={query.isPlaceholderData}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="invoices-title" className="text-sm text-ink-400">
          <span className="font-semibold text-ink-100">
            {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}
          </span>{' '}
          of {total.toLocaleString('en-US')} invoices
        </h2>
        <p className="text-xs text-ink-500">Newest first · amounts in {items[0].currency}</p>
      </div>

      <div
        className={`mt-4 transition-opacity motion-reduce:transition-none ${
          query.isPlaceholderData ? 'opacity-60' : ''
        }`}
      >
        {/* Wide screens: a table you can scan down. */}
        <div className="card hidden overflow-hidden rounded-3xl md:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Your invoices</caption>
            <thead>
              <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-[0.16em] text-ink-400">
                <th scope="col" className="px-6 py-4 font-semibold">
                  Invoice
                </th>
                <th scope="col" className="px-4 py-4 font-semibold">
                  Issued
                </th>
                <th scope="col" className="px-4 py-4 font-semibold">
                  Movie
                </th>
                <th scope="col" className="px-4 py-4 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-4 py-4 font-semibold">
                  Status
                </th>
                <th scope="col" className="w-12 px-4 py-4">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: one card per invoice. */}
        <ul className="grid grid-cols-1 gap-3 md:hidden">
          {items.map((invoice) => (
            <li key={invoice.id}>
              <InvoiceCard invoice={invoice} />
            </li>
          ))}
        </ul>
      </div>

      {pages > 1 ? (
        <Pagination page={page} pages={pages} hrefFor={(p) => hrefFor(filter.status, p)} />
      ) : null}
    </section>
  );
}

/** A table row that opens as a whole: the invoice number's link stretches over the row. */
function InvoiceRow({ invoice }: { invoice: InvoiceSummary }) {
  return (
    <tr className="group relative border-b border-white/[0.05] transition last:border-0 focus-within:bg-white/[0.05] hover:bg-white/[0.035] motion-reduce:transition-none">
      <td className="px-6 py-4">
        <Link
          href={invoiceHref(invoice.id)}
          className="font-mono text-sm font-semibold text-ink-50 after:absolute after:inset-0 after:content-['']"
        >
          {invoice.number}
        </Link>
        <p className="mt-0.5 font-mono text-xs text-ink-500">{invoice.bookingCode}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-ink-200">
        <time dateTime={invoice.issuedAt}>{invoiceDate(invoice.issuedAt)}</time>
      </td>
      <td className="max-w-[18rem] px-4 py-4">
        <p className="truncate font-semibold text-ink-100">{invoice.movieTitle}</p>
        <p className="truncate text-xs text-ink-400">
          {invoice.theaterName} · {invoice.seatCount} {invoice.seatCount === 1 ? 'seat' : 'seats'}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-ink-50">
        {invoiceAmount(invoice.total)}
        {invoice.amountRefunded > 0 ? (
          <p className="text-xs font-normal text-ink-400">
            {invoiceAmount(invoice.amountRefunded)} refunded
          </p>
        ) : null}
      </td>
      <td className="px-4 py-4">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[invoice.status]}`}
        >
          {STATUS_LABEL[invoice.status]}
        </span>
      </td>
      <td className="px-4 py-4 text-ink-500">
        <ChevronRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:text-ink-200 motion-reduce:transition-none" />
      </td>
    </tr>
  );
}

function InvoiceCard({ invoice }: { invoice: InvoiceSummary }) {
  return (
    <Link
      href={invoiceHref(invoice.id)}
      className="card group flex items-center gap-3.5 rounded-2xl p-4 transition hover:border-white/20 motion-reduce:transition-none"
    >
      {/* Decoration only where there is room for it; the number never wraps. */}
      <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/30 xs:inline-flex">
        <ReceiptIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate whitespace-nowrap font-mono text-sm font-semibold text-ink-50">
            {invoice.number}
          </span>
          <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-ink-50">
            {invoiceMoney(invoice.total, invoice.currency)}
          </span>
        </span>
        <span className="mt-1.5 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs text-ink-400">
            {invoice.movieTitle} · {invoiceDate(invoice.issuedAt)}
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[invoice.status]}`}
          >
            {STATUS_LABEL[invoice.status]}
          </span>
        </span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const all = !filter.status;
  return (
    <div className="card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/30">
        <ReceiptIcon className="h-7 w-7" />
      </span>
      <p className="mt-5 font-display text-2xl text-ink-50">
        {all ? 'No invoices yet' : `No ${filter.label.toLowerCase()} invoices`}
      </p>
      <p className="mt-2 max-w-sm text-sm text-ink-400">
        {all
          ? 'Once you pay for a booking, its invoice shows up here.'
          : 'Nothing here right now. Your other invoices are under All.'}
      </p>
      <Link href={all ? '/movies' : hrefFor(undefined, 1)} className="btn-primary mt-6">
        {all ? 'Browse movies' : 'Show all invoices'}
      </Link>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your invoices</span>
      <div aria-hidden="true" className="flex gap-2">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="h-10 w-24 animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none"
          />
        ))}
      </div>
      <div aria-hidden="true" className="card space-y-3 rounded-3xl p-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="block h-10 animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

function hrefFor(status: InvoiceStatus | undefined, page: number): string {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (page > 1) query.set('page', String(page));
  const qs = query.toString();
  return `${ACCOUNT_ROUTES.invoices}${qs ? `?${qs}` : ''}`;
}
