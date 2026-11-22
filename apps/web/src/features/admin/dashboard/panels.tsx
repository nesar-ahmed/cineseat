'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { AdminDashboard } from '@cineseat/shared';
import { money } from '../../catalog/format';
import { relativeTime } from '../../notifications/time';
import { adminBookingHref } from '../links';
import { clock, count, showDay } from './format';

/** The card every dashboard panel sits in. */
export function Panel({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-inset"
    >
      <div className="px-5 pb-3 pt-5 sm:px-6">
        <h2 id={id} className="text-base font-semibold text-ink-50">
          {title}
        </h2>
        <p className="text-xs text-ink-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 pb-6 pt-2 text-sm text-ink-400 sm:px-6">{children}</p>;
}

/** Sold share at which a show counts as "almost full" (the API alerts admins at the same point). */
const ALMOST_FULL = 0.9;

export function UpcomingShows({
  shows,
  today,
}: {
  shows: AdminDashboard['upcomingShows'];
  today: string;
}) {
  return (
    <Panel id="upcoming-title" title="Next shows" subtitle="Starting soonest · seats sold and held">
      {shows.length === 0 ? (
        <Empty>No shows are scheduled.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {shows.map((show) => {
            const capacity = Math.max(1, show.capacity);
            const soldOut = show.sold >= show.capacity && show.capacity > 0;
            const almostFull = !soldOut && show.sold / capacity >= ALMOST_FULL;
            return (
              <li key={show.id} className="flex items-center gap-4 px-5 py-3.5 sm:px-6">
                <div className="w-16 shrink-0">
                  <p className="text-sm font-semibold tabular-nums text-ink-50">
                    {clock(show.startsAt)}
                  </p>
                  <p className="text-xs text-ink-400">{showDay(show.startsAt, today)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-ink-100">
                    <span className="truncate">{show.movieTitle}</span>
                    {show.format === '3D' ? (
                      <span className="rounded border border-white/15 px-1 text-[10px] font-bold text-ink-300">
                        3D
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {show.theater} · {show.screen}
                  </p>
                </div>
                <div className="w-28 shrink-0 sm:w-36">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="tabular-nums text-ink-200">
                      {count(show.sold)}/{count(show.capacity)}
                    </span>
                    {soldOut ? (
                      <span className="font-semibold text-brand-300">Sold out</span>
                    ) : almostFull ? (
                      <span className="font-semibold text-gold-300">Almost full</span>
                    ) : (
                      <span className="text-ink-500">
                        {Math.round((show.sold / capacity) * 100)}%
                      </span>
                    )}
                  </div>
                  <div
                    role="img"
                    aria-label={`${show.sold} of ${show.capacity} seats sold${show.held ? `, ${show.held} held` : ''}`}
                    className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                  >
                    <span
                      style={{ width: `${(show.sold / capacity) * 100}%` }}
                      className={soldOut ? 'bg-brand-500' : 'bg-emerald-400/80'}
                    />
                    <span
                      style={{ width: `${(show.held / capacity) * 100}%` }}
                      className="bg-gold-400"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function RecentBookings({
  bookings,
  now,
}: {
  bookings: AdminDashboard['recentBookings'];
  now: number;
}) {
  return (
    <Panel id="recent-title" title="Latest bookings" subtitle="Paid most recently">
      {bookings.length === 0 ? (
        <Empty>No paid bookings yet.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <Link
                href={adminBookingHref(booking.id)}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-6"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-ink-200"
                >
                  {booking.buyerName
                    .split(/\s+/)
                    .map((part) => part[0] ?? '')
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-100">
                    {booking.buyerName}
                    <span className="text-ink-500"> · </span>
                    <span className="text-ink-300">{booking.movieTitle}</span>
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    <span className="font-mono">{booking.code}</span> · {booking.seats}{' '}
                    {booking.seats === 1 ? 'seat' : 'seats'} ·{' '}
                    <time dateTime={booking.paidAt}>{relativeTime(booking.paidAt, now)}</time>
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-50">
                  {money(booking.amount)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TopMovies({ movies }: { movies: AdminDashboard['topMovies'] }) {
  const best = Math.max(1, ...movies.map((movie) => movie.revenue));
  return (
    <Panel id="top-title" title="Best sellers" subtitle="Last 7 days · by revenue">
      {movies.length === 0 ? (
        <Empty>No sales in the last 7 days.</Empty>
      ) : (
        <ol className="flex flex-col gap-4 border-t border-white/[0.05] px-5 py-4 sm:px-6">
          {movies.map((movie, index) => (
            <li key={movie.id}>
              <div className="flex items-baseline gap-3">
                <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-ink-500">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">
                  {movie.title}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-50">
                  {money(movie.revenue)}
                </span>
              </div>
              <div className="ml-7 mt-1.5 flex items-center gap-3">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    style={{ width: `${(movie.revenue / best) * 100}%` }}
                    className="block h-full rounded-full bg-brand-500/70"
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-400">
                  {count(movie.tickets)} tickets
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
