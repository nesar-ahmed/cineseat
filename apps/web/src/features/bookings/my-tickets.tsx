'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookingStatus } from '@cineseat/shared';
import { TicketIcon } from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { useNow } from '../../hooks/use-now';
import { ACCOUNT_ROUTES } from '../account/links';
import { FilterBar, FilterPill, Pagination, pageParam } from '../account/list-controls';
import { PanelHeader } from '../account/panel-header';
import { useBookingCount, useMyBookings } from './queries';
import { TicketCard, TicketCardSkeleton } from './ticket-card';

type Filter = { status?: BookingStatus; label: string; empty: string };

const FILTERS: Filter[] = [
  { label: 'All', empty: 'tickets' },
  { status: 'CONFIRMED', label: 'Confirmed', empty: 'confirmed tickets' },
  { status: 'PENDING', label: 'Awaiting payment', empty: 'bookings awaiting payment' },
  { status: 'FAILED', label: 'Not completed', empty: 'bookings that did not complete' },
  { status: 'CANCELLED', label: 'Cancelled', empty: 'cancelled bookings' },
];

/**
 * My tickets (`/account/bookings`): every booking, newest first (GET /bookings),
 * filtered by status and paged. Filter and page live in the URL, so Back,
 * refresh and shared links all land on the same view.
 */
export function MyTickets() {
  const params = useSearchParams();
  const status = BookingStatus.safeParse(params.get('status')).data;
  const page = pageParam(params.get('page'));
  const active = FILTERS.find((filter) => filter.status === status) ?? FILTERS[0];
  // Counts and the clock are browser-only: render them after hydration.
  const hydrated = useHydrated();

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PanelHeader
        trail={[{ label: 'My account', href: ACCOUNT_ROUTES.overview }, { label: 'My tickets' }]}
        eyebrow="Bookings"
        title="My tickets"
        description="Every booking you have made, with its code for the cinema counter."
        actions={
          <Link href="/movies" className="btn-primary">
            <TicketIcon className="h-4 w-4" />
            Book a movie
          </Link>
        }
      />
      {hydrated ? (
        <>
          <TicketFilters active={active} />
          <TicketList filter={active} page={page} />
        </>
      ) : (
        <ListSkeleton />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- filters */

function TicketFilters({ active }: { active: Filter }) {
  return (
    <FilterBar label="Filter tickets">
      {FILTERS.map((filter) => (
        <FilterLink key={filter.label} filter={filter} active={filter === active} />
      ))}
    </FilterBar>
  );
}

function FilterLink({ filter, active }: { filter: Filter; active: boolean }) {
  const count = useBookingCount(filter.status);
  const total = count.data?.total;
  // Statuses nobody has yet stay out of the way; All and Confirmed are always there.
  const always = !filter.status || filter.status === 'CONFIRMED';
  if (!always && !active && (total ?? 0) === 0) return null;

  return (
    <FilterPill
      href={hrefFor(filter.status, 1)}
      label={filter.label}
      count={total}
      active={active}
    />
  );
}

/* ------------------------------------------------------------------- list */

function TicketList({ filter, page }: { filter: Filter; page: number }) {
  const query = useMyBookings(page, filter.status);
  const awaiting = query.data?.items.some((booking) => booking.status === 'PENDING') ?? false;
  // Tick every second only while a hold countdown is on screen.
  const now = useNow(awaiting ? 1000 : 30_000);

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) {
    return (
      <div className="card rounded-3xl p-8 text-center">
        <p className="font-display text-xl text-ink-50">Couldn’t load your tickets</p>
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
        <p className="mt-2 text-sm text-ink-400">There are {pages} pages of tickets.</p>
        <Link href={hrefFor(filter.status, 1)} className="btn-primary mt-6">
          Go to the first page
        </Link>
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = from + items.length - 1;
  return (
    <section aria-labelledby="tickets-title" aria-busy={query.isPlaceholderData}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tickets-title" className="text-sm text-ink-400">
          <span className="font-semibold text-ink-100">
            {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}
          </span>{' '}
          of {total.toLocaleString('en-US')}{' '}
          {filter.status ? filter.label.toLowerCase() : 'tickets'}
        </h2>
        <p className="text-xs text-ink-500">Newest bookings first</p>
      </div>
      <ul
        className={`mt-4 grid grid-cols-1 gap-4 transition-opacity motion-reduce:transition-none ${
          query.isPlaceholderData ? 'opacity-60' : ''
        }`}
      >
        {items.map((booking) => (
          <li key={booking.id}>
            <TicketCard booking={booking} now={now} />
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <Pagination page={page} pages={pages} hrefFor={(p) => hrefFor(filter.status, p)} />
      ) : null}
    </section>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const all = !filter.status;
  return (
    <div className="card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-200 ring-1 ring-gold-400/30">
        <TicketIcon className="h-7 w-7" />
      </span>
      <p className="mt-5 font-display text-2xl text-ink-50">
        {all ? 'No tickets yet' : `No ${filter.empty}`}
      </p>
      <p className="mt-2 max-w-sm text-sm text-ink-400">
        {all
          ? 'Pick a movie and your seats — your tickets will show up here.'
          : 'Nothing here right now. Your other bookings are under All.'}
      </p>
      <Link href={all ? '/movies' : hrefFor(undefined, 1)} className="btn-primary mt-6">
        {all ? 'Browse movies' : 'Show all tickets'}
      </Link>
    </div>
  );
}

function hrefFor(status: BookingStatus | undefined, page: number): string {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (page > 1) query.set('page', String(page));
  const qs = query.toString();
  return `${ACCOUNT_ROUTES.tickets}${qs ? `?${qs}` : ''}`;
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your tickets</span>
      <div aria-hidden="true" className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-10 w-28 animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none"
          />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <TicketCardSkeleton key={i} />
      ))}
    </div>
  );
}
