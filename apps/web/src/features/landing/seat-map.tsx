'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClockIcon } from '../../components/ui/icons';
import { MAX_SEATS, HOLD_SECONDS, SEAT_PRICES, seatCategory } from './seat-map-rules';

type SeatState = 'free' | 'selected' | 'held' | 'booked';

const ROWS = 'ABCDEFGH'.split('');
const COLS = 10;

/**
 * Deterministic starting layout, so the server and client render agree on their
 * first paint (mirrors the seeded screen: 8 rows × 10 cols, 80 seats).
 */
function initialState(row: number, col: number): SeatState {
  if ((row * 7 + col * 3) % 11 === 0) return 'booked';
  if ((row * 5 + col * 2) % 13 === 0) return 'held';
  return 'free';
}

const SEAT_STYLES: Record<SeatState, string> = {
  free: 'border-ink-700 bg-seat-free text-ink-400 hover:bg-seat-hover hover:text-ink-200',
  selected: 'border-brand-400 bg-brand-500 text-white shadow-glow',
  held: 'border-gold-400/70 bg-gold-400/15 text-gold-300',
  booked: 'border-ink-800 bg-seat-booked text-ink-600',
};

/** Held seats also breathe, unless the visitor asked for less motion. */
const SEAT_EXTRA: Record<SeatState, string> = {
  free: '',
  selected: '',
  held: 'animate-seat-pulse motion-reduce:animate-none',
  booked: 'cursor-not-allowed',
};

/** A swatch per legend entry, written out so Tailwind can see every class. */
const LEGEND: { state: SeatState; label: string; swatch: string }[] = [
  { state: 'free', label: 'Available', swatch: 'border-ink-700 bg-seat-free text-ink-400' },
  { state: 'selected', label: 'Yours', swatch: 'border-brand-400 bg-brand-500 text-white' },
  { state: 'held', label: 'Held', swatch: 'border-gold-400/70 bg-gold-400/15 text-gold-300' },
  { state: 'booked', label: 'Sold', swatch: 'border-ink-800 bg-seat-booked text-ink-600' },
];

/** Shape carries the meaning, colour only repeats it. */
const GLYPH: Record<SeatState, string> = { free: '', selected: '✓', held: '·', booked: '×' };

const STATE_LABEL: Record<SeatState, string> = {
  free: 'available',
  selected: 'selected',
  held: 'held by someone else',
  booked: 'sold',
};

function format(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SeatMapCard() {
  const [picked, setPicked] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(HOLD_SECONDS);
  const [notice, setNotice] = useState('Pick a seat to start your 5:00 hold');

  const rows = useMemo(
    () =>
      ROWS.map((letter, index) => ({
        letter,
        number: index + 1,
        category: seatCategory(index + 1, ROWS.length),
        seats: Array.from({ length: COLS }, (_, i) => ({
          key: `${letter}${i + 1}`,
          col: i + 1,
          state: initialState(index + 1, i + 1),
        })),
      })),
    [],
  );

  // The countdown runs only while seats are picked, and drops them at zero.
  useEffect(() => {
    if (picked.length === 0) {
      setRemaining(HOLD_SECONDS);
      return;
    }
    const id = window.setInterval(() => setRemaining((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(id);
  }, [picked.length]);

  useEffect(() => {
    if (remaining === 0 && picked.length > 0) {
      setPicked([]);
      setNotice('Hold expired — those seats went back on the map');
    }
  }, [remaining, picked.length]);

  const toggle = useCallback((key: string, state: SeatState) => {
    if (state === 'held' || state === 'booked') {
      setNotice(`Seat ${key} is ${STATE_LABEL[state]} — pick another chair`);
      return;
    }
    setPicked((current) => {
      if (current.includes(key)) {
        setNotice(`Released ${key}`);
        return current.filter((item) => item !== key);
      }
      if (current.length >= MAX_SEATS) {
        setNotice(`Six seats is the limit for one booking`);
        return current;
      }
      const next = [...current, key];
      setNotice(next.length === 1 ? `Hold started for ${key} — 5:00 on the clock` : `${next.length} seats held`);
      return next;
    });
  }, []);

  const total = picked.reduce(
    (sum, key) => sum + SEAT_PRICES[seatCategory(ROWS.indexOf(key[0]) + 1, ROWS.length)],
    0,
  );

  return (
    <div className="card grain relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg leading-tight text-ink-50">Midnight Express</p>
          <p className="text-xs text-ink-400">CineSeat Bashundhara · Screen 1 · 8:30 PM</p>
        </div>
        <span className="chip tabular-nums">
          <ClockIcon className="h-3.5 w-3.5" />
          {format(remaining)}
        </span>
      </div>

      {/* A trapezoid of light reads as "front of the hall". */}
      <div className="relative mt-5 h-8">
        <div className="mx-auto h-px w-3/4 bg-gradient-to-r from-transparent via-ink-300 to-transparent" />
        <div className="mx-auto h-6 w-3/4 rounded-b-[100%] bg-gradient-to-b from-ink-200/10 to-transparent" />
        <p className="absolute inset-x-0 bottom-0 text-center text-[10px] uppercase tracking-[0.4em] text-ink-500">
          Screen
        </p>
      </div>

      <ul className="mt-4 space-y-1.5 sm:space-y-2">
        {rows.map((row) => (
          <li key={row.letter} className="flex items-center gap-1.5">
            <span
              className={`w-4 shrink-0 text-center font-mono text-[10px] ${
                row.category === 'STANDARD' ? 'text-ink-500' : 'text-gold-400'
              }`}
            >
              {row.letter}
            </span>
            {row.seats.map((seat) => {
              const state = picked.includes(seat.key) ? 'selected' : seat.state;
              return (
                <button
                  key={seat.key}
                  type="button"
                  onClick={() => toggle(seat.key, seat.state)}
                  aria-pressed={state === 'selected'}
                  aria-label={`Row ${row.letter}, seat ${seat.col}, ${STATE_LABEL[state]}`}
                  disabled={state === 'booked'}
                  className={`seat h-8 min-w-0 flex-1 sm:h-9 ${SEAT_STYLES[state]} ${SEAT_EXTRA[state]}`}
                >
                  {GLYPH[state] || seat.col}
                </button>
              );
            })}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-400">
        {LEGEND.map((item) => (
          <span key={item.state} className="inline-flex items-center gap-1.5">
            <span className={`seat h-4 w-4 border ${item.swatch}`}>
              <span className="text-[8px] leading-none">{GLYPH[item.state] || '·'}</span>
            </span>
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-gold-400">
          <span className="h-2 w-2 rounded-full bg-gold-400" />
          Premium &amp; recliner rows
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">
            {picked.length} of {MAX_SEATS} seats · {SEAT_PRICES.STANDARD}–{SEAT_PRICES.RECLINER} ৳
          </p>
          <p className="font-display text-2xl tabular-nums">
            {picked.length ? (
              <span className="text-ink-50">{total.toLocaleString('en-US')} ৳</span>
            ) : (
              <span className="text-ink-600">—</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className={picked.length ? 'btn-primary w-full sm:w-auto' : 'btn-ghost w-full sm:w-auto opacity-50'}
        >
          {picked.length ? 'Continue to checkout' : 'Select a seat'}
        </button>
      </div>

      {/* Seat changes are announced, not just shown. */}
      <p aria-live="polite" className="mt-3 text-center text-xs text-ink-400">
        {notice}
      </p>
    </div>
  );
}
