'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AdminBookingSort,
  PaymentStatus,
  defaultBookingSortOrder,
  type AdminBooking,
  type AdminBookingList,
} from '@cineseat/shared';
import { ReceiptIcon, RefreshIcon, SeatIcon, TicketIcon } from '../../../components/ui/icons';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { exactTime, relativeTime } from '../../notifications/time';
import { count } from '../dashboard/format';
import { adminBookingHref } from '../links';
import { useAdminMovies } from '../movies/queries';
import { useAllTheaters } from '../theaters/queries';
import { PosterThumb } from '../ui/bits';
import { DateRange, FilterDrawer, FilterGroup, TogglePills, toggleIn } from '../ui/filter-kit';
import { clock12, plural, shortDate, shortDateTime, weekdayDate } from '../ui/format';
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
import { BookingBadge, PAYMENT_STATE, PaymentBadge, bookingState, seatList } from './bits';
import {
  NO_FILTERS,
  SORT_LABEL,
  activeFilterCount,
  effectiveOrder,
  orderLabel,
  parseQuery,
  toApiParams,
  toSearchParams,
  type BookingsQuery,
  type FilterPatch,
  type StatusTab,
} from './list-query';
import { useAdminBookings } from './queries';

const TABS: { id: StatusTab; label: string; count: (c: AdminBookingList['counts']) => number }[] = [
  { id: 'all', label: 'All', count: (c) => c.all },
  { id: 'CONFIRMED', label: 'Paid', count: (c) => c.CONFIRMED },
  { id: 'PENDING', label: 'Paying', count: (c) => c.PENDING },
  { id: 'FAILED', label: 'Not completed', count: (c) => c.FAILED },
  { id: 'CANCELLED', label: 'Cancelled', count: (c) => c.CANCELLED },
];
const SORTS = AdminBookingSort.options.map((value) => ({ value, label: SORT_LABEL[value] }));
/** Payment outcomes as filters: what an admin looks for. */
const PAYMENT_FILTER: { value: PaymentStatus; label: string }[] = [
  { value: 'REFUNDED', label: 'Money refunded' },
  { value: 'FAILED', label: 'A payment failed' },
  { value: 'PENDING', label: 'A payment is open' },
  { value: 'SUCCESS', label: 'Paid' },
];

/**
 * `/admin/bookings`: every buyer's bookings — who, what, which seats, how much,
 * and how the payment went — with status tabs, search by code, buyer or movie,
 * filters, sorting and pages, the whole view in the URL. A strip on top adds up
 * what the view selects (bookings, seats, money in, money back). Read-only:
 * bookings change through the booking flow.
 */
export function AdminBookingsPage() {
  const { user } = useAuth();
  const now = useNow(30_000);
  const { query, setQuery, hrefWith } = useUrlQuery(parseQuery, toSearchParams);
  const params = useMemo(() => toApiParams(query), [query]);
  const list = useAdminBookings(user?.id, params);
  const theaters = useAllTheaters(user?.id);
  const movies = useAdminMovies(user?.id, { sort: 'title', pageSize: 100 });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const update = useCallback(
    (patch: Partial<BookingsQuery>) => setQuery({ page: 1, ...patch }),
    [setQuery],
  );
  const goTo = useCallback((page: number) => setQuery({ page }), [setQuery]);
  const data = list.data;
  usePageClamp(data, list.isPlaceholderData, query.page, goTo);

  const items = data?.items ?? [];
  const filters = activeFilterCount(query);
  const filtered = filters > 0 || query.q.trim() !== '';
  const order = effectiveOrder(query);
  const names = useMemo(
    () => ({
      theater: new Map((theaters.data?.items ?? []).map((item) => [item.id, item.name])),
      movie: new Map((movies.data?.items ?? []).map((item) => [item.id, item.title])),
    }),
    [theaters.data, movies.data],
  );
  // Ids the lists cannot name (a show, a buyer) are named from the bookings on screen.
  const showName = (id: string) => {
    const show = items.find((item) => item.show.id === id)?.show;
    return show
      ? `${show.movie.title} · ${weekdayDate(show.date)}, ${clock12(show.time)}`
      : 'A show';
  };
  const buyerName = (id: string) =>
    items.find((item) => item.buyer.id === id)?.buyer.name ?? 'A buyer';

  return (
    <div className="flex flex-col gap-6 pb-16">
      <PageHeader
        eyebrow="Sales"
        title="Bookings"
        description="Every booking, with its seats, money and payment attempts."
        actions={
          <RefreshButton
            onClick={() => void list.refetch()}
            busy={list.isFetching}
            label="Refresh the list"
          />
        }
      />

      <TotalsStrip label="Totals of this view">
        <TotalTile icon={TicketIcon} label="Bookings" value={data ? count(data.total) : '·'} />
        <TotalTile
          icon={SeatIcon}
          label="Seats"
          value={data ? count(data.totals.seats) : '·'}
          hint="Sold, or held while paying"
        />
        <TotalTile
          icon={ReceiptIcon}
          label="Paid"
          value={data ? money(data.totals.paid) : '·'}
          hint="Successful payments"
        />
        <TotalTile
          icon={RefreshIcon}
          label="Refunded"
          value={data ? money(data.totals.refunded) : '·'}
          hint="Late or duplicate money sent back"
        />
      </TotalsStrip>

      <div className="flex flex-col gap-4">
        <TabPills
          label="Status"
          value={query.tab}
          onChange={(tab) => update({ tab })}
          tabs={TABS.filter(
            (tab) => tab.id !== 'CANCELLED' || (data?.counts.CANCELLED ?? 0) > 0,
          ).map((tab) => ({ ...tab, count: data ? tab.count(data.counts) : null }))}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q })}
            label="Search bookings"
            placeholder="Search a code (CS-…), buyer, email or movie"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltersButton count={filters} onClick={() => setFiltersOpen(true)} />
            <SortControl
              id="bookings-sort"
              sorts={SORTS}
              sort={query.sort}
              order={order}
              naturalOrder={defaultBookingSortOrder}
              orderLabel={orderLabel}
              onChange={update}
            />
          </div>
        </div>
        <FilterChips
          chips={chipsFor(query, update, { ...names, show: showName, buyer: buyerName })}
          onClearAll={() => update(NO_FILTERS)}
        />
      </div>

      {list.isPending ? (
        <ListSkeleton label="Loading bookings" />
      ) : list.isError && !data ? (
        <ListError
          what="bookings"
          message={list.error.message}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyResults
          icon={TicketIcon}
          filtered={filtered || query.tab !== 'all'}
          onClear={() => update({ ...NO_FILTERS, q: '', tab: 'all' })}
          emptyTitle="No bookings yet"
          emptyText="Bookings appear here as soon as someone holds seats for a show."
        />
      ) : (
        <section aria-label="Results">
          <BookingsTable
            bookings={items}
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
        title="Filter bookings"
        value={query}
        empty={NO_FILTERS}
        onApply={update}
      >
        {(draft, set) => (
          <>
            <FilterGroup label="Payment" hint="Any of these happened">
              <TogglePills
                options={PAYMENT_FILTER}
                chosen={draft.payments}
                onToggle={(value) =>
                  set({ payments: toggleIn(draft.payments, value as PaymentStatus) })
                }
              />
            </FilterGroup>
            <FilterGroup label="Booked">
              <DateRange
                from={draft.bookedFrom}
                to={draft.bookedTo}
                onChange={({ from, to }) => set({ bookedFrom: from, bookedTo: to })}
              />
            </FilterGroup>
            <FilterGroup label="Show date">
              <DateRange
                from={draft.showFrom}
                to={draft.showTo}
                onChange={({ from, to }) => set({ showFrom: from, showTo: to })}
              />
            </FilterGroup>
            <FilterGroup label="Theaters">
              <TogglePills
                options={(theaters.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                chosen={draft.theaters}
                onToggle={(id) => set({ theaters: toggleIn(draft.theaters, id) })}
              />
            </FilterGroup>
            <FilterGroup label="Movies" hint="Any of these">
              <TogglePills
                options={(movies.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.title,
                }))}
                chosen={draft.movies}
                onToggle={(id) => set({ movies: toggleIn(draft.movies, id) })}
              />
            </FilterGroup>
            <FilterGroup label="Offer code" hint="Press Enter to add">
              <CouponInput codes={draft.coupons} onChange={(coupons) => set({ coupons })} />
            </FilterGroup>
          </>
        )}
      </FilterDrawer>
    </div>
  );
}

/** Offer codes as chips; typed codes are added on Enter (upper-case, as stored). */
function CouponInput({
  codes,
  onChange,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const code = text.trim().toUpperCase();
    if (/^[A-Z0-9_-]{3,32}$/.test(code) && !codes.includes(code)) onChange([...codes, code]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed="true"
          onClick={() => onChange(codes.filter((item) => item !== code))}
          aria-label={`Remove ${code}`}
          className="pill py-1.5 font-mono"
        >
          {code} ×
        </button>
      ))}
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="e.g. FLAT100"
        aria-label="Offer code"
        className="input h-9 w-36 py-1 font-mono uppercase"
      />
    </div>
  );
}

/** The bookings: a table on wide screens, cards below `xl`. Each row opens the booking. */
function BookingsTable({
  bookings,
  now,
  sort,
  order,
  onSort,
  stale,
}: {
  bookings: AdminBooking[];
  now: number | null;
  sort: AdminBookingSort;
  order: 'asc' | 'desc';
  onSort: (sort: AdminBookingSort) => void;
  stale: boolean;
}) {
  const sortProps = { sort, order, onSort };
  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${stale ? 'opacity-60' : ''}`}
    >
      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Bookings</caption>
          <thead className="border-b border-white/[0.07] bg-white/[0.02] text-xs text-ink-400">
            <tr>
              <SortHeader {...sortProps} column="created" className="w-40 pl-5">
                Booking
              </SortHeader>
              <th scope="col" className="w-[18%] px-3 py-3 font-medium">
                Buyer
              </th>
              <SortHeader {...sortProps} column="showtime">
                Show
              </SortHeader>
              <SortHeader {...sortProps} column="seats" className="w-32">
                Seats
              </SortHeader>
              <SortHeader {...sortProps} column="amount" className="w-28" align="right">
                Amount
              </SortHeader>
              <th scope="col" className="w-36 px-3 py-3 font-medium">
                Payment
              </th>
              <th scope="col" className="w-32 py-3 pl-3 pr-5 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {bookings.map((booking) => (
              <tr
                key={booking.id}
                className="relative transition-colors hover:bg-white/[0.03] motion-reduce:transition-none"
              >
                <td className="py-3 pl-5 pr-3">
                  <Link
                    href={adminBookingHref(booking.id)}
                    className="font-mono text-sm font-semibold text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    {booking.code}
                  </Link>
                  <p className="text-xs text-ink-400">
                    <time dateTime={booking.createdAt} title={exactTime(booking.createdAt)}>
                      {now
                        ? relativeTime(booking.createdAt, now)
                        : shortDateTime(booking.createdAt)}
                    </time>
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="truncate font-medium text-ink-100">{booking.buyer.name}</p>
                  <p className="truncate text-xs text-ink-400">{booking.buyer.email}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <PosterThumb movie={booking.show.movie} className="w-8" />
                    <div className="min-w-0">
                      <p className="truncate text-ink-100">{booking.show.movie.title}</p>
                      <p className="truncate text-xs text-ink-300">
                        {weekdayDate(booking.show.date)}, {clock12(booking.show.time)}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {booking.show.theater.name} · {booking.show.screen.name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="truncate text-ink-200">{seatList(booking.seats, 3)}</p>
                  <p className="text-xs text-ink-500">{plural(booking.seats.length, 'seat')}</p>
                </td>
                <td className="px-3 py-3 text-right">
                  <p className="font-semibold tabular-nums text-ink-50">{money(booking.total)}</p>
                  {booking.couponCode ? (
                    <p className="truncate font-mono text-[11px] text-gold-300">
                      {booking.couponCode}
                    </p>
                  ) : booking.refunded ? (
                    <p className="text-[11px] text-sky-300">{money(booking.refunded)} back</p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {booking.payment ? (
                    <>
                      <PaymentBadge status={booking.payment.status} />
                      <p className="mt-1 truncate text-[11px] text-ink-500">
                        {booking.payment.attempts > 1
                          ? `${booking.payment.attempts} attempts`
                          : (booking.payment.method ?? 'Waiting at the gateway')}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-ink-500">No payment yet</span>
                  )}
                </td>
                <td className="py-3 pl-3 pr-5">
                  <BookingBadge state={bookingState(booking, now)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid grid-cols-1 gap-3 xl:hidden">
        {bookings.map((booking) => (
          <li
            key={booking.id}
            className="relative rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15 motion-reduce:transition-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={adminBookingHref(booking.id)}
                  className="font-mono text-sm font-semibold text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                >
                  {booking.code}
                </Link>
                <p className="truncate text-sm text-ink-200">{booking.buyer.name}</p>
              </div>
              <BookingBadge state={bookingState(booking, now)} />
            </div>
            <div className="mt-3 flex gap-3">
              <PosterThumb movie={booking.show.movie} className="w-10" />
              <div className="min-w-0 text-sm">
                <p className="truncate text-ink-100">{booking.show.movie.title}</p>
                <p className="truncate text-xs text-ink-400">
                  {weekdayDate(booking.show.date)}, {clock12(booking.show.time)} ·{' '}
                  {booking.show.theater.name}
                </p>
                <p className="truncate text-xs text-ink-400">{seatList(booking.seats)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-sm">
              {booking.payment ? (
                <span className="text-xs text-ink-400">
                  {PAYMENT_STATE[booking.payment.status].label}
                  {booking.payment.attempts > 1 ? ` · ${booking.payment.attempts} attempts` : ''}
                </span>
              ) : (
                <span className="text-xs text-ink-500">No payment yet</span>
              )}
              <span className="font-semibold tabular-nums text-ink-50">{money(booking.total)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function chipsFor(
  query: BookingsQuery,
  update: (patch: Partial<BookingsQuery>) => void,
  names: {
    theater: Map<string, string>;
    movie: Map<string, string>;
    show: (id: string) => string;
    buyer: (id: string) => string;
  },
): FilterChip[] {
  const drop =
    <K extends 'payments' | 'movies' | 'theaters' | 'shows' | 'users' | 'coupons'>(
      key: K,
      value: string,
    ) =>
    () =>
      update({
        [key]: (query[key] as string[]).filter((item) => item !== value),
      } as Partial<BookingsQuery>);
  const range = (from: string | null, to: string | null) =>
    from && to
      ? from === to
        ? shortDate(from)
        : `${shortDate(from)} – ${shortDate(to)}`
      : from
        ? `from ${shortDate(from)}`
        : `until ${shortDate(to!)}`;
  return [
    ...query.payments.map((value) => ({
      key: `p-${value}`,
      label: PAYMENT_FILTER.find((item) => item.value === value)?.label ?? value,
      remove: drop('payments', value),
    })),
    ...(query.bookedFrom || query.bookedTo
      ? [
          {
            key: 'booked',
            label: `Booked ${range(query.bookedFrom, query.bookedTo)}`,
            remove: () => update({ bookedFrom: null, bookedTo: null }),
          },
        ]
      : []),
    ...(query.showFrom || query.showTo
      ? [
          {
            key: 'showdate',
            label: `Show ${range(query.showFrom, query.showTo)}`,
            remove: () => update({ showFrom: null, showTo: null }),
          },
        ]
      : []),
    ...query.theaters.map((id) => ({
      key: `t-${id}`,
      label: names.theater.get(id) ?? 'A theater',
      remove: drop('theaters', id),
    })),
    ...query.movies.map((id) => ({
      key: `m-${id}`,
      label: names.movie.get(id) ?? 'A movie',
      remove: drop('movies', id),
    })),
    ...query.shows.map((id) => ({
      key: `s-${id}`,
      label: names.show(id),
      remove: drop('shows', id),
    })),
    ...query.users.map((id) => ({
      key: `u-${id}`,
      label: `Buyer: ${names.buyer(id)}`,
      remove: drop('users', id),
    })),
    ...query.coupons.map((code) => ({
      key: `c-${code}`,
      label: `Offer ${code}`,
      remove: drop('coupons', code),
    })),
  ];
}
