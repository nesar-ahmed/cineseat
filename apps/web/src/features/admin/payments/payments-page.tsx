'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AdminPaymentSort,
  PaymentChannel,
  type AdminPaymentList,
  type AdminPaymentRow,
} from '@cineseat/shared';
import { AlertIcon, ClockIcon, ReceiptIcon, RefreshIcon } from '../../../components/ui/icons';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { exactTime, relativeTime } from '../../notifications/time';
import { adminPaymentHref, adminUserHref } from '../links';
import { PAYMENT_STATE, PaymentBadge } from '../bookings/bits';
import { PosterThumb } from '../ui/bits';
import { DateRange, FilterDrawer, FilterGroup, TogglePills, toggleIn } from '../ui/filter-kit';
import { clock12, shortDate, shortDateTime, weekdayDate } from '../ui/format';
import {
  EmptyResults,
  FilterChips,
  FiltersButton,
  ListError,
  ListFooter,
  ListSkeleton,
  RefreshButton,
  SearchBox,
  SortControl,
  SortHeader,
  TabPills,
  TotalTile,
  TotalsStrip,
  nextSort,
  usePageClamp,
  type FilterChip,
} from '../ui/list-kit';
import { PageHeader } from '../ui/page-kit';
import { useUrlQuery } from '../use-url-query';
import { useAdminUser } from '../users/queries';
import { CHANNEL, ChannelMark } from './bits';
import {
  NO_FILTERS,
  SORT_LABEL,
  activeFilterCount,
  effectiveOrder,
  naturalOrder,
  orderLabel,
  parseQuery,
  toApiParams,
  toSearchParams,
  type FilterPatch,
  type PaymentsQuery,
  type StatusTab,
} from './list-query';
import { useAdminPayments } from './queries';

const TABS: { id: StatusTab; label: string; count: (c: AdminPaymentList['counts']) => number }[] = [
  { id: 'all', label: 'All', count: (c) => c.all },
  { id: 'SUCCESS', label: 'Paid', count: (c) => c.SUCCESS },
  { id: 'FAILED', label: 'Failed', count: (c) => c.FAILED },
  { id: 'REFUNDED', label: 'Refunded', count: (c) => c.REFUNDED },
  { id: 'PENDING', label: 'Open', count: (c) => c.PENDING },
];
const SORTS = AdminPaymentSort.options.map((value) => ({ value, label: SORT_LABEL[value] }));
const CHANNELS = PaymentChannel.options.map((value) => ({ value, label: CHANNEL[value].label }));

/**
 * `/admin/payments`: every payment attempt, for reconciliation — what came in,
 * what went back, what failed and why — with status tabs, search by reference,
 * booking code or buyer, filters (how they paid, when, how much), sorting and
 * pages, the whole view in the URL. A strip on top adds up the money in the
 * view. Read-only: payments change only through the provider's webhook. Each
 * row opens the attempt on its booking's page.
 */
export function AdminPaymentsPage() {
  const { user } = useAuth();
  const now = useNow(30_000);
  const { query, setQuery, hrefWith } = useUrlQuery(parseQuery, toSearchParams);
  const params = useMemo(() => toApiParams(query), [query]);
  const list = useAdminPayments(user?.id, params);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const update = useCallback(
    (patch: Partial<PaymentsQuery>) => setQuery({ page: 1, ...patch }),
    [setQuery],
  );
  const goTo = useCallback((page: number) => setQuery({ page }), [setQuery]);
  const data = list.data;
  usePageClamp(data, list.isPlaceholderData, query.page, goTo);

  const items = data?.items ?? [];
  const filters = activeFilterCount(query);
  const filtered = filters > 0 || query.q.trim() !== '';
  const order = effectiveOrder(query);

  // A buyer filter (from their account page) is named from the rows on screen,
  // or — when they have none here — from their account.
  const onScreen = (id: string) => items.find((item) => item.buyer.id === id)?.buyer.name;
  const lone = query.users.length === 1 ? query.users[0] : '';
  const account = useAdminUser(user?.id, lone, {
    enabled: Boolean(lone) && !list.isPending && !onScreen(lone),
  });
  const buyerName = (id: string) =>
    onScreen(id) ?? (account.data?.id === id ? account.data.name : 'A buyer');

  const settled = data ? data.counts.SUCCESS + data.counts.FAILED : 0;

  return (
    <div className="flex flex-col gap-6 pb-16">
      <PageHeader
        eyebrow="Sales"
        title="Payments"
        description="Every payment attempt — what came in, what went back, and what failed."
        actions={
          <RefreshButton
            onClick={() => void list.refetch()}
            busy={list.isFetching}
            label="Refresh the list"
          />
        }
      />

      <TotalsStrip label="Money in this view">
        <TotalTile
          icon={ReceiptIcon}
          label="Collected"
          value={data ? money(data.totals.collected) : '·'}
          hint="Successful payments"
          tone="good"
        />
        <TotalTile
          icon={RefreshIcon}
          label="Refunded"
          value={data ? money(data.totals.refunded) : '·'}
          hint="Late or duplicate money sent back"
          tone="info"
        />
        <TotalTile
          icon={AlertIcon}
          label="Failed"
          value={data ? money(data.totals.failed) : '·'}
          hint={
            data && settled > 0
              ? `${share(data.counts.FAILED, settled)} of settled attempts · never charged`
              : 'Declined or abandoned · never charged'
          }
          tone="bad"
        />
        <TotalTile
          icon={ClockIcon}
          label="Open"
          value={data ? money(data.totals.open) : '·'}
          hint="Waiting at the provider"
          tone="open"
        />
      </TotalsStrip>

      <div className="flex flex-col gap-4">
        <TabPills
          label="Outcome"
          value={query.tab}
          onChange={(tab) => update({ tab })}
          tabs={TABS.map((tab) => ({ ...tab, count: data ? tab.count(data.counts) : null }))}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q })}
            label="Search payments"
            placeholder="Search a reference, booking code (CS-…), buyer or email"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltersButton count={filters} onClick={() => setFiltersOpen(true)} />
            <SortControl
              id="payments-sort"
              sorts={SORTS}
              sort={query.sort}
              order={order}
              naturalOrder={naturalOrder}
              orderLabel={orderLabel}
              onChange={update}
            />
          </div>
        </div>
        <FilterChips
          chips={chipsFor(query, update, buyerName)}
          onClearAll={() => update(NO_FILTERS)}
        />
      </div>

      {list.isPending ? (
        <ListSkeleton label="Loading payments" />
      ) : list.isError && !data ? (
        <ListError
          what="payments"
          message={list.error.message}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyResults
          icon={ReceiptIcon}
          filtered={filtered || query.tab !== 'all'}
          onClear={() => update({ ...NO_FILTERS, q: '', tab: 'all' })}
          emptyTitle="No payments yet"
          emptyText="Payment attempts appear here as soon as a buyer goes to pay for held seats."
        />
      ) : (
        <section aria-label="Results">
          <PaymentsTable
            payments={items}
            now={now}
            sort={query.sort}
            order={order}
            onSort={(column) => update(nextSort(column, { sort: query.sort, order }))}
            stale={list.isPlaceholderData}
          />
          <ListFooter
            page={data!.page}
            pageSize={data!.pageSize}
            shown={items.length}
            total={data!.total}
            onPageSize={(size) => update({ size })}
            hrefFor={(page) => hrefWith({ page })}
          />
        </section>
      )}

      <FilterDrawer<FilterPatch>
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter payments"
        value={query}
        empty={NO_FILTERS}
        onApply={update}
      >
        {(draft, set) => (
          <>
            <FilterGroup label="Paid with" hint="Any of these">
              <TogglePills
                options={CHANNELS}
                chosen={draft.channels}
                onToggle={(value) =>
                  set({ channels: toggleIn(draft.channels, value as PaymentChannel) })
                }
              />
            </FilterGroup>
            <FilterGroup label="Started">
              <DateRange
                from={draft.from}
                to={draft.to}
                onChange={({ from, to }) => set({ from, to })}
              />
            </FilterGroup>
            <FilterGroup label="Amount" hint="In taka, inclusive">
              <AmountRange
                min={draft.min}
                max={draft.max}
                onChange={({ min, max }) => set({ min, max })}
              />
            </FilterGroup>
          </>
        )}
      </FilterDrawer>
    </div>
  );
}

/** "12%", or "<1%" for a few in many (never a misleading 0%). */
function share(part: number, whole: number): string {
  const value = (part / whole) * 100;
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
}

/** A from–to pair of whole-taka inputs; an empty box means "no limit". */
function AmountRange({
  min,
  max,
  onChange,
}: {
  min: number | null;
  max: number | null;
  onChange: (range: { min: number | null; max: number | null }) => void;
}) {
  const read = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 7);
    return digits === '' ? null : Number(digits);
  };
  const box = (label: string, value: number | null, set: (value: number | null) => void) => (
    <label className="text-xs text-ink-400">
      {label}
      <span className="relative mt-1 block">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-500"
        >
          ৳
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value ?? ''}
          placeholder={label === 'At least' ? '0' : 'No limit'}
          onChange={(event) => set(read(event.target.value))}
          className="input pl-7 tabular-nums"
        />
      </span>
    </label>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {box('At least', min, (value) => onChange({ min: value, max }))}
      {box('At most', max, (value) => onChange({ min, max: value }))}
      {min !== null && max !== null && min > max ? (
        <p className="col-span-2 text-xs text-gold-300">
          The smaller amount comes first — they will be swapped.
        </p>
      ) : null}
    </div>
  );
}

/** The payments: a table on wide screens, cards below `xl`. Each opens the attempt on its booking. */
function PaymentsTable({
  payments,
  now,
  sort,
  order,
  onSort,
  stale,
}: {
  payments: AdminPaymentRow[];
  now: number | null;
  sort: AdminPaymentSort;
  order: 'asc' | 'desc';
  onSort: (sort: AdminPaymentSort) => void;
  stale: boolean;
}) {
  const sortProps = { sort, order, onSort };
  const when = (iso: string) => (
    <time dateTime={iso} title={exactTime(iso)}>
      {now ? relativeTime(iso, now) : shortDateTime(iso)}
    </time>
  );
  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${stale ? 'opacity-60' : ''}`}
    >
      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Payments</caption>
          <thead className="border-b border-white/[0.07] bg-white/[0.02] text-xs text-ink-400">
            <tr>
              <SortHeader {...sortProps} column="amount" className="w-36 pl-5">
                Payment
              </SortHeader>
              <th scope="col" className="w-[16%] px-3 py-3 font-medium">
                Buyer
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                For
              </th>
              <th scope="col" className="w-[21%] px-3 py-3 font-medium">
                Paid with
              </th>
              <SortHeader {...sortProps} column="created" className="w-40">
                Started
              </SortHeader>
              <SortHeader {...sortProps} column="completed" className="w-36 pr-5">
                Settled
              </SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {payments.map((payment) => (
              <tr
                key={payment.id}
                className="relative transition-colors hover:bg-white/[0.03] motion-reduce:transition-none"
              >
                <td className="py-3 pl-5 pr-3">
                  <Link
                    href={adminPaymentHref(payment.booking.id, payment.id)}
                    aria-label={`${money(payment.amount)} — ${PAYMENT_STATE[payment.status].label.toLowerCase()}, ${payment.buyer.name}, ${payment.booking.code}`}
                    className={`font-semibold tabular-nums outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline ${
                      payment.status === 'SUCCESS' ? 'text-ink-50' : 'text-ink-300'
                    }`}
                  >
                    {money(payment.amount)}
                  </Link>
                  <p
                    className="truncate font-mono text-[11px] text-ink-500"
                    title={payment.providerRef}
                  >
                    {payment.providerRef}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={adminUserHref(payment.buyer.id)}
                    className="relative z-[1] inline-block max-w-full truncate align-top font-medium text-ink-100 hover:underline"
                  >
                    {payment.buyer.name}
                  </Link>
                  <p className="truncate text-xs text-ink-400">{payment.buyer.email}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <PosterThumb movie={payment.show.movie} className="w-8" />
                    <div className="min-w-0">
                      <p className="truncate text-ink-100">
                        <span className="font-mono text-xs font-semibold text-ink-300">
                          {payment.booking.code}
                        </span>{' '}
                        · {payment.show.movie.title}
                      </p>
                      <p className="truncate text-xs text-ink-400">
                        {weekdayDate(payment.show.date)}, {clock12(payment.show.time)} ·{' '}
                        {payment.show.theater.name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="flex items-center gap-2">
                    <ChannelMark channel={payment.channel} />
                    <span className="truncate text-ink-200">
                      {payment.method ?? 'Not reported yet'}
                    </span>
                  </p>
                  {payment.failureReason ? (
                    <p
                      className={`mt-1 truncate text-[11px] ${
                        payment.status === 'REFUNDED' ? 'text-sky-300/80' : 'text-brand-300/90'
                      }`}
                      title={payment.failureReason}
                    >
                      {payment.failureReason}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-200">
                  {when(payment.createdAt)}
                </td>
                <td className="py-3 pl-3 pr-5">
                  <PaymentBadge status={payment.status} />
                  <p className="mt-1 truncate text-[11px] text-ink-500">
                    {payment.completedAt ? when(payment.completedAt) : 'Not settled'}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid grid-cols-1 gap-3 xl:hidden">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="relative rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15 motion-reduce:transition-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={adminPaymentHref(payment.booking.id, payment.id)}
                  className="text-lg font-semibold tabular-nums text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                >
                  {money(payment.amount)}
                </Link>
                <p className="truncate text-sm text-ink-200">
                  {payment.buyer.name} · {when(payment.createdAt)}
                </p>
              </div>
              <PaymentBadge status={payment.status} />
            </div>
            <div className="mt-3 flex gap-3">
              <PosterThumb movie={payment.show.movie} className="w-10" />
              <div className="min-w-0 text-sm">
                <p className="truncate text-ink-100">
                  <span className="font-mono text-xs font-semibold text-ink-300">
                    {payment.booking.code}
                  </span>{' '}
                  · {payment.show.movie.title}
                </p>
                <p className="truncate text-xs text-ink-400">
                  {weekdayDate(payment.show.date)}, {clock12(payment.show.time)} ·{' '}
                  {payment.show.theater.name}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs">
              <ChannelMark channel={payment.channel} />
              <span className="min-w-0 truncate text-ink-400">
                {payment.failureReason ?? payment.method ?? 'Not reported yet'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function chipsFor(
  query: PaymentsQuery,
  update: (patch: Partial<PaymentsQuery>) => void,
  buyerName: (id: string) => string,
): FilterChip[] {
  const range = (from: string | null, to: string | null) =>
    from && to
      ? from === to
        ? shortDate(from)
        : `${shortDate(from)} – ${shortDate(to)}`
      : from
        ? `from ${shortDate(from)}`
        : `until ${shortDate(to!)}`;
  const taka = (value: number) => money(value * 100);
  return [
    ...query.channels.map((channel) => ({
      key: `c-${channel}`,
      label: `Paid with ${CHANNEL[channel].label}`,
      remove: () => update({ channels: query.channels.filter((item) => item !== channel) }),
    })),
    ...(query.from || query.to
      ? [
          {
            key: 'started',
            label: `Started ${range(query.from, query.to)}`,
            remove: () => update({ from: null, to: null }),
          },
        ]
      : []),
    ...(query.min !== null || query.max !== null
      ? [
          {
            key: 'amount',
            label:
              query.min !== null && query.max !== null
                ? `${taka(query.min)} – ${taka(query.max)}`
                : query.min !== null
                  ? `At least ${taka(query.min)}`
                  : `At most ${taka(query.max!)}`,
            remove: () => update({ min: null, max: null }),
          },
        ]
      : []),
    ...query.users.map((id) => ({
      key: `u-${id}`,
      label: `Buyer: ${buyerName(id)}`,
      remove: () => update({ users: query.users.filter((item) => item !== id) }),
    })),
  ];
}
