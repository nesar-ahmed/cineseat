'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SeatCategory, SeatMap, ShowSeat } from '@cineseat/shared';
import { money } from '../catalog/format';

/** What a seat looks like to this buyer. */
export type SeatView = 'free' | 'selected' | 'held' | 'booked';

export const CATEGORY_LABEL: Record<SeatCategory, string> = {
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
  RECLINER: 'Recliner',
};

const VIEW_LABEL: Record<SeatView, string> = {
  free: 'available',
  selected: 'selected',
  held: 'on hold for another buyer',
  booked: 'sold',
};

const SEAT_STYLE: Record<SeatView, string> = {
  free: 'border-ink-700 bg-seat-free text-ink-300 hover:border-ink-500 hover:bg-seat-hover hover:text-ink-50',
  selected: 'border-brand-400 bg-brand-500 text-white shadow-glow',
  held: 'cursor-not-allowed border-gold-400/60 bg-gold-400/15 text-gold-300 animate-seat-pulse motion-reduce:animate-none',
  booked: 'cursor-not-allowed border-ink-800 bg-seat-booked text-ink-600',
};

/** Shape carries the meaning; colour only repeats it. Free seats show their number. */
const GLYPH: Record<SeatView, string> = { free: '', selected: '✓', held: '·', booked: '×' };

const LEGEND: { view: SeatView; label: string }[] = [
  { view: 'free', label: 'Available' },
  { view: 'selected', label: 'Your pick' },
  { view: 'held', label: 'On hold' },
  { view: 'booked', label: 'Sold' },
];

type Row = { row: number; label: string; seats: ShowSeat[] };
type Section = { category: SeatCategory; rows: Row[] };

type Props = {
  map: SeatMap;
  viewOf: (seat: ShowSeat) => SeatView;
  onPick: (seat: ShowSeat) => void;
};

/**
 * The hall, screen at the top. Rows are grouped into priced sections (standard
 * at the front, recliners at the back). One tab stop for the whole map: arrow
 * keys move between seats, Enter or Space picks — and every seat announces its
 * row, number, category, price and state.
 */
export function SeatGrid({ map, viewOf, onPick }: Props) {
  const sections = useMemo(() => toSections(map.seats), [map.seats]);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focusId, setFocusId] = useState<string | null>(null);
  const tabStop =
    (focusId && map.seats.some((seat) => seat.id === focusId) ? focusId : null) ??
    map.seats.find((seat) => viewOf(seat) === 'selected')?.id ??
    map.seats.find((seat) => viewOf(seat) === 'free')?.id ??
    map.seats[0]?.id;

  const move = (event: KeyboardEvent, seat: ShowSeat) => {
    const rows = sections.flatMap((section) => section.rows);
    const rowIndex = rows.findIndex((item) => item.row === seat.row);
    const inRow = rows[rowIndex].seats;
    let target: ShowSeat | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        target = [...inRow].reverse().find((item) => item.number < seat.number);
        break;
      case 'ArrowRight':
        target = inRow.find((item) => item.number > seat.number);
        break;
      case 'ArrowUp':
        target = nearest(rows[rowIndex - 1]?.seats, seat.number);
        break;
      case 'ArrowDown':
        target = nearest(rows[rowIndex + 1]?.seats, seat.number);
        break;
      case 'Home':
        target = inRow[0];
        break;
      case 'End':
        target = inRow[inRow.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target) {
      setFocusId(target.id);
      buttons.current.get(target.id)?.focus();
    }
  };

  return (
    <div>
      {/* A band of light reads as "front of the hall". */}
      <div aria-hidden="true" className="relative mx-auto mb-8 h-10 max-w-xl">
        <div className="mx-auto h-1 w-full rounded-full bg-gradient-to-r from-transparent via-ink-200 to-transparent shadow-[0_0_24px_rgba(232,232,240,0.35)]" />
        <div className="mx-auto h-8 w-[92%] bg-gradient-to-b from-ink-200/[0.12] to-transparent [clip-path:polygon(0_0,100%_0,88%_100%,12%_100%)]" />
        <p className="absolute inset-x-0 bottom-0 text-center text-[10px] font-semibold uppercase tracking-[0.5em] text-ink-500">
          Screen
        </p>
      </div>

      <div
        role="group"
        aria-label="Seats"
        className="mx-auto space-y-6"
        style={{ maxWidth: `${map.cols * 2.75 + 3}rem` }}
      >
        {sections.map((section) => (
          <div key={`${section.category}-${section.rows[0].row}`}>
            <p className="mb-2.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]">
              <span className={section.category === 'STANDARD' ? 'text-ink-400' : 'text-gold-300'}>
                {CATEGORY_LABEL[section.category]}
              </span>
              <span className="h-px flex-1 bg-white/[0.06]" />
              <span className="tabular-nums text-ink-300">
                {money(map.prices[section.category] ?? section.rows[0].seats[0].price)}
              </span>
            </p>
            <ul className="space-y-1.5 sm:space-y-2">
              {section.rows.map((row) => (
                <li key={row.row} className="flex items-center gap-1.5 sm:gap-2.5">
                  <RowLabel label={row.label} category={section.category} />
                  <div
                    className="grid flex-1 gap-1 sm:gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))` }}
                  >
                    {row.seats.map((seat) => {
                      const view = viewOf(seat);
                      const unavailable = view === 'held' || view === 'booked';
                      return (
                        <button
                          key={seat.id}
                          ref={(element) => {
                            if (element) buttons.current.set(seat.id, element);
                            else buttons.current.delete(seat.id);
                          }}
                          type="button"
                          tabIndex={seat.id === tabStop ? 0 : -1}
                          aria-pressed={view === 'selected'}
                          aria-disabled={unavailable}
                          aria-label={`${seat.label}, ${CATEGORY_LABEL[seat.category]}, ${money(seat.price)}, ${VIEW_LABEL[view]}`}
                          onClick={() => onPick(seat)}
                          onFocus={() => setFocusId(seat.id)}
                          onKeyDown={(event) => move(event, seat)}
                          style={{ gridColumnStart: seat.number }}
                          className={`seat aspect-square min-w-0 text-[9px] sm:text-[11px] ${SEAT_STYLE[view]}`}
                        >
                          {GLYPH[view] || seat.number}
                        </button>
                      );
                    })}
                  </div>
                  <RowLabel label={row.label} category={section.category} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-ink-400">
        {LEGEND.map((item) => (
          <li key={item.view} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`seat h-5 w-5 text-[10px] ${SEAT_STYLE[item.view]}`}
            >
              {GLYPH[item.view]}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowLabel({ label, category }: { label: string; category: SeatCategory }) {
  return (
    <span
      aria-hidden="true"
      className={`w-4 shrink-0 text-center font-mono text-[10px] sm:text-xs ${category === 'STANDARD' ? 'text-ink-500' : 'text-gold-400'}`}
    >
      {label}
    </span>
  );
}

/** Rows front to back, seats left to right, consecutive rows of one category as a section. */
function toSections(seats: ShowSeat[]): Section[] {
  const rows = new Map<number, ShowSeat[]>();
  for (const seat of seats) rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat]);
  const sections: Section[] = [];
  for (const [row, list] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    const ordered = list.sort((a, b) => a.number - b.number);
    const category = ordered[0].category;
    const item: Row = { row, label: ordered[0].label.replace(/\d+$/, ''), seats: ordered };
    const last = sections[sections.length - 1];
    if (last?.category === category) last.rows.push(item);
    else sections.push({ category, rows: [item] });
  }
  return sections;
}

/** The seat in `row` closest to seat number `number`. */
function nearest(row: ShowSeat[] | undefined, number: number): ShowSeat | undefined {
  if (!row?.length) return undefined;
  return row.reduce((best, seat) =>
    Math.abs(seat.number - number) < Math.abs(best.number - number) ? seat : best,
  );
}
