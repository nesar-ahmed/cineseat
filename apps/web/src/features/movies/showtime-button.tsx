'use client';

import type { ShowAvailability, Showtime } from '@cineseat/shared';
import { money, time12 } from '../catalog/format';

const DOT: Record<ShowAvailability, string> = {
  AVAILABLE: 'bg-emerald-400',
  FILLING: 'bg-gold-400',
  ALMOST_FULL: 'bg-brand-400',
  SOLD_OUT: 'bg-ink-600',
};

export const AVAILABILITY_LABEL: Record<ShowAvailability, string> = {
  AVAILABLE: 'Available',
  FILLING: 'Filling fast',
  ALMOST_FULL: 'Almost full',
  SOLD_OUT: 'Sold out',
};

/**
 * Whether a show has started. The API's `bookable` was right when it answered;
 * the browser clock (`now`, null until hydrated) catches shows that started
 * while the page was open.
 */
export function hasStarted(show: Showtime, now: number | null): boolean {
  if (now !== null && Date.parse(show.startsAt) <= now) return true;
  return !show.bookable && show.seats.available > 0;
}

export function canBook(show: Showtime, now: number | null): boolean {
  return show.bookable && !hasStarted(show, now);
}

type Props = {
  show: Showtime;
  now: number | null;
  selected?: boolean;
  onSelect: () => void;
  /** Compact chips in lists; roomy buttons on the movie's page. */
  size?: 'sm' | 'md';
};

/** Time + availability dot (+ price in the roomy size). Colour is never the only signal. */
export function ShowtimeButton({ show, now, selected = false, onSelect, size = 'md' }: Props) {
  const started = hasStarted(show, now);
  const disabled = !canBook(show, now);
  const state = started ? 'Started' : AVAILABILITY_LABEL[show.availability];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative flex flex-col items-start rounded-xl border text-left transition motion-reduce:transition-none ${
        size === 'sm' ? 'px-2.5 py-1.5' : 'min-w-[104px] px-3.5 py-2.5'
      } ${
        selected
          ? 'border-brand-400 bg-brand-500/20 shadow-glow'
          : disabled
            ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.02] opacity-45'
            : 'border-white/10 bg-white/[0.03] hover:border-brand-400/70 hover:bg-brand-500/10'
      }`}
    >
      <span
        className={`flex items-center gap-1.5 font-semibold tabular-nums text-ink-50 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${started ? 'bg-ink-600' : DOT[show.availability]}`}
        />
        {time12(show.time)}
        {show.format === '3D' ? (
          <span className="rounded bg-gold-400/90 px-1 text-[9px] font-bold text-ink-950">3D</span>
        ) : null}
      </span>
      {/* The visible text is the accessible name; the compact chip adds its state for screen readers. */}
      {size === 'md' ? (
        <span className="mt-0.5 text-[11px] text-ink-400">
          {disabled ? state : `${money(show.priceFrom)} · ${state}`}
        </span>
      ) : (
        <span className="sr-only">, {state}</span>
      )}
    </button>
  );
}
