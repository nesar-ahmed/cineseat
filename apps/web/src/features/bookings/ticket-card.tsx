'use client';

import Link from 'next/link';
import type { Booking } from '@cineseat/shared';
import { CalendarIcon, ChevronRightIcon, ClockIcon, MapPinIcon } from '../../components/ui/icons';
import { money } from '../catalog/format';
import { PosterArt } from '../catalog/poster-art';
import { useMovie } from '../catalog/queries';
import { showWhen, startsIn, ticketState, TONE_BADGE } from './ticket-state';

/** Seats shown on a card before "+3 more". */
const SEATS_SHOWN = 4;

/**
 * One booking in the tickets list, drawn as a ticket stub: the show on the
 * left, the code and price on the tear-off. The whole card is one link — to the
 * ticket, or back to checkout while the seats are still held for payment.
 */
export function TicketCard({ booking, now }: { booking: Booking; now: number | null }) {
  const { show } = booking;
  const state = ticketState(booking, now);
  const movie = useMovie(show.movie.id).data;
  const dim = state.tone === 'muted';
  const soon = state.kind === 'today' ? startsIn(booking, now) : null;
  const holdLeft =
    state.kind === 'awaiting' && booking.expiresAt && now !== null
      ? Math.max(0, Date.parse(booking.expiresAt) - now)
      : null;

  return (
    <Link
      href={state.href}
      aria-label={`${show.movie.title}, ${showWhen(booking)}, ${state.label}. ${state.cta}`}
      className={`card ticket-edge group relative flex flex-col overflow-hidden rounded-3xl transition duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:flex-row ${
        dim ? 'opacity-80 hover:opacity-100' : ''
      }`}
    >
      {/* The show */}
      <div className="flex min-w-0 flex-1 gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="w-16 shrink-0 sm:w-[76px]">
          {movie ? (
            <PosterArt
              movie={movie}
              className={`aspect-[2/3] w-full rounded-xl text-[8px] ring-1 ring-white/10 ${dim ? 'grayscale-[60%]' : ''}`}
            />
          ) : (
            <div aria-hidden="true" className="aspect-[2/3] w-full rounded-xl bg-white/[0.05]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_BADGE[state.tone]}`}
            >
              {state.label}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
              {show.format} · {show.language}
            </span>
          </div>
          <h3 className="mt-2 truncate font-sans text-lg font-semibold text-ink-50 sm:text-xl">
            {show.movie.title}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-200">
            <CalendarIcon className="h-4 w-4 shrink-0 text-ink-400" />
            <span className="truncate">{showWhen(booking)}</span>
            {soon ? (
              <span className="shrink-0 text-xs font-semibold text-gold-300">· {soon}</span>
            ) : null}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-300">
            <MapPinIcon className="h-4 w-4 shrink-0 text-ink-400" />
            <span className="truncate">
              {show.theater.name} · {show.screen.name}
            </span>
          </p>
          <ul aria-label="Seats" className="mt-3 flex flex-wrap gap-1.5">
            {booking.seats.slice(0, SEATS_SHOWN).map((seat) => (
              <li
                key={seat.id}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs font-semibold text-ink-100"
              >
                {seat.label}
              </li>
            ))}
            {booking.seats.length > SEATS_SHOWN ? (
              <li className="px-1 py-0.5 text-xs text-ink-400">
                +{booking.seats.length - SEATS_SHOWN} more
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* The tear-off stub: a dashed perforation, then the code and the price. */}
      <div className="flex items-center justify-between gap-4 border-t border-dashed border-white/15 px-4 py-3.5 sm:w-52 sm:flex-col sm:items-stretch sm:justify-center sm:border-l sm:border-t-0 sm:px-5 sm:py-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
            Booking code
          </p>
          <p
            className={`mt-0.5 font-mono text-sm font-bold tracking-[0.08em] ${dim ? 'text-ink-300' : 'text-gold-200'}`}
          >
            {booking.code}
          </p>
        </div>
        <div className="text-right sm:mt-3 sm:text-left">
          <p className="font-display text-xl font-semibold tabular-nums text-ink-50">
            {money(booking.total)}
          </p>
          {holdLeft !== null ? (
            <p className="flex items-center gap-1 text-xs font-semibold text-gold-200 sm:mt-0.5">
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{countdown(holdLeft)}</span> left
            </p>
          ) : null}
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 group-hover:text-brand-200 sm:mt-2">
            {state.cta}
            <ChevronRightIcon className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </p>
        </div>
      </div>
    </Link>
  );
}

export function TicketCardSkeleton() {
  return (
    <div aria-hidden="true" className="card flex flex-col overflow-hidden rounded-3xl sm:flex-row">
      <div className="flex flex-1 gap-4 p-4 sm:gap-5 sm:p-5">
        <span className="aspect-[2/3] w-16 shrink-0 animate-pulse rounded-xl bg-white/[0.05] motion-reduce:animate-none sm:w-[76px]" />
        <span className="flex flex-1 flex-col gap-2.5 pt-1">
          <span className="h-4 w-24 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
          <span className="h-5 w-48 max-w-full animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
          <span className="h-3.5 w-40 max-w-full animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none" />
          <span className="h-3.5 w-36 max-w-full animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none" />
        </span>
      </div>
      <div className="h-16 border-t border-dashed border-white/10 sm:h-auto sm:w-52 sm:border-l sm:border-t-0" />
    </div>
  );
}

function countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
