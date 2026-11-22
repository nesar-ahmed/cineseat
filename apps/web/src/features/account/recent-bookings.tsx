'use client';

import Link from 'next/link';
import type { Booking } from '@cineseat/shared';
import { ChevronRightIcon } from '../../components/ui/icons';
import { useNow } from '../../hooks/use-now';
import { dayInfo, money, time12 } from '../catalog/format';
import { useMyBookings } from '../bookings/queries';
import { ticketState, TONE_BADGE } from '../bookings/ticket-state';
import { ACCOUNT_ROUTES } from './links';

/** How many bookings the overview previews; the tickets page has the rest. */
const PREVIEW = 3;

/**
 * The latest bookings (GET /bookings is newest-first by purchase), each opening
 * its ticket page — or checkout while it still waits for payment.
 */
export function RecentBookings() {
  const query = useMyBookings(1);
  const now = useNow();

  return (
    <section aria-labelledby="recent-title" className="card rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="recent-title" className="text-xl font-semibold tracking-tight text-ink-50">
            Recent bookings
          </h2>
          <p className="mt-1 text-sm text-ink-400">Your latest purchases.</p>
        </div>
        {query.data && query.data.total > 0 ? (
          <Link
            href={ACCOUNT_ROUTES.tickets}
            className="shrink-0 rounded-full px-2 py-1 text-sm font-semibold text-brand-300 hover:text-brand-200"
          >
            View all
            <span className="sr-only"> tickets</span>
          </Link>
        ) : null}
      </div>

      <div className="mt-5">
        {query.isPending ? (
          <ul aria-busy="true" className="space-y-3">
            <li className="sr-only">Loading your bookings</li>
            {Array.from({ length: PREVIEW }, (_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className="h-[76px] animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : query.isError ? (
          <p className="text-sm text-ink-300">
            Couldn’t load your bookings.{' '}
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="font-semibold text-brand-300 hover:text-brand-200"
            >
              Try again
            </button>
          </p>
        ) : query.data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
            <p className="font-display text-lg text-ink-50">No bookings yet</p>
            <p className="mt-1.5 text-sm text-ink-400">
              Pick a movie and your seats — your tickets will show up here.
            </p>
            <Link href="/movies" className="btn-primary mt-5">
              Browse movies
            </Link>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {query.data.items.slice(0, PREVIEW).map((booking) => (
              <li key={booking.id}>
                <BookingRow booking={booking} now={now} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function BookingRow({ booking, now }: { booking: Booking; now: number | null }) {
  const { show } = booking;
  const day = dayInfo(show.date);
  // The same label the tickets list and the ticket page use (Upcoming, Today, Screened, …).
  const state = ticketState(booking, now);
  const screened = state.tone === 'muted';
  const href = state.href;

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 pr-4 transition hover:border-white/20 hover:bg-white/[0.04] motion-reduce:transition-none"
    >
      {/* The show's date as a small calendar leaf: the fastest thing to scan. */}
      <span
        className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 leading-none ${
          screened
            ? 'border-white/10 bg-white/[0.03] text-ink-400'
            : 'border-gold-400/30 bg-gold-400/10 text-gold-100'
        }`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{day.weekday}</span>
        <span className="mt-1 font-display text-xl font-semibold tabular-nums">{day.day}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] opacity-80">
          {day.month}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-ink-50">{show.movie.title}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE[state.tone]}`}
          >
            {state.label}
          </span>
        </span>
        <span className="mt-1 block truncate text-sm text-ink-300">
          {time12(show.time)} · {show.theater.name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-400">
          {booking.seats.length === 1 ? 'Seat' : 'Seats'}{' '}
          {booking.seats.map((seat) => seat.label).join(', ')} ·{' '}
          <span className="font-mono">{booking.code}</span>
        </span>
      </span>

      <span className="hidden shrink-0 text-right xs:block">
        <span className="block font-display text-lg font-semibold tabular-nums text-ink-50">
          {money(booking.total)}
        </span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-ink-200 motion-reduce:transition-none" />
    </Link>
  );
}
