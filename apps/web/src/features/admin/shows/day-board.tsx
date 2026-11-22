'use client';

import Link from 'next/link';
import type { AdminShow, AdminTheater, ShowAvailability } from '@cineseat/shared';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../../../components/ui/icons';
import { cinemaToday } from '../../catalog/format';
import { adminScheduleHref, adminShowHref } from '../links';
import { addDays, cinemaInstant, clock12, plural, weekdayDate } from '../ui/format';

/** Minutes a screen needs between two shows (the API's TURNAROUND_MINUTES). */
const TURNAROUND = 20;
const MINUTE = 60_000;

const TONE: Record<ShowAvailability, string> = {
  AVAILABLE: 'border-emerald-400/40 bg-emerald-400/[0.12] hover:bg-emerald-400/20',
  FILLING: 'border-sky-400/50 bg-sky-400/[0.14] hover:bg-sky-400/25',
  ALMOST_FULL: 'border-gold-400/60 bg-gold-400/[0.16] hover:bg-gold-400/25',
  SOLD_OUT: 'border-brand-500/60 bg-brand-500/[0.18] hover:bg-brand-500/30',
};

/**
 * One cinema day, screen by screen: each show is a block as long as its film,
 * with the turnaround after it hatched, coloured by how full it is — so gaps
 * (room for another show) and crowded screens show at a glance. Blocks open
 * the show; "+" on a screen schedules there. Times are on the cinemas' clock;
 * a show after midnight belongs to the day it started on.
 */
export function DayBoard({
  day,
  onDay,
  shows,
  theaters,
  now,
  loading,
}: {
  day: string;
  onDay: (day: string) => void;
  shows: AdminShow[];
  /** The cinemas whose screens get a lane (the filters' theaters and cities, or all). */
  theaters: AdminTheater[];
  now: number | null;
  loading: boolean;
}) {
  const dayStart = Date.parse(cinemaInstant(day, '00:00'));
  const minutes = (iso: string) => (Date.parse(iso) - dayStart) / MINUTE;
  const starts = shows.map((show) => minutes(show.startsAt));
  const ends = shows.map((show) => minutes(show.endsAt) + TURNAROUND);
  const axisStart = Math.min(9 * 60, Math.floor(Math.min(...starts, Infinity) / 60) * 60);
  const axisEnd = Math.min(30 * 60, Math.max(24 * 60, Math.ceil(Math.max(...ends, 0) / 60) * 60));
  const span = axisEnd - axisStart;
  const at = (minute: number) => `${((minute - axisStart) / span) * 100}%`;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => axisStart + i * 60);
  const today = now ? cinemaToday(now) : null;
  const nowMinute = now && today === day ? (now - dayStart) / MINUTE : null;

  const byScreen = new Map<string, AdminShow[]>();
  for (const show of shows)
    byScreen.set(show.screen.id, [...(byScreen.get(show.screen.id) ?? []), show]);
  const screenCount = theaters.reduce((sum, theater) => sum + theater.screens.length, 0);

  return (
    <section aria-label={`Schedule for ${weekdayDate(day)}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDay(addDays(day, -1))}
          aria-label="Previous day"
          className="btn-icon"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <label className="sr-only" htmlFor="board-day">
          Day
        </label>
        <input
          id="board-day"
          type="date"
          value={day}
          onChange={(event) => event.target.value && onDay(event.target.value)}
          className="input h-10 w-44"
        />
        <button
          type="button"
          onClick={() => onDay(addDays(day, 1))}
          aria-label="Next day"
          className="btn-icon"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        {today && today !== day ? (
          <button type="button" onClick={() => onDay(today)} className="btn-ghost px-4 py-2">
            Today
          </button>
        ) : null}
        <p className="ml-auto text-sm text-ink-400" aria-live="polite">
          {loading
            ? 'Loading…'
            : `${weekdayDate(day)} · ${plural(shows.length, 'show')} on ${plural(screenCount, 'screen')}`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div className={`min-w-[960px] transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Hour axis */}
          <div className="flex border-b border-white/[0.07] bg-white/[0.02]">
            <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-white/[0.07] bg-ink-950 px-4 py-2 text-xs font-medium text-ink-400">
              Screen
            </div>
            <div className="relative h-9 flex-1">
              {hours.map((minute) => (
                <span
                  key={minute}
                  style={{ left: at(minute) }}
                  className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-ink-500 first:translate-x-0 last:-translate-x-full"
                >
                  {clock12(`${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:00`).replace(
                    ':00 ',
                    ' ',
                  )}
                </span>
              ))}
            </div>
          </div>

          {theaters.map((theater) => (
            <div key={theater.id}>
              <div className="flex border-b border-white/[0.05] bg-white/[0.015]">
                <p className="sticky left-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
                  {theater.name}{' '}
                  <span className="font-normal normal-case tracking-normal text-ink-500">
                    · {theater.city}
                  </span>
                </p>
              </div>
              {theater.screens.length === 0 ? (
                <p className="border-b border-white/[0.05] px-4 py-3 text-xs text-ink-500">
                  No screens yet.
                </p>
              ) : null}
              {theater.screens.map((screen) => {
                const lane = byScreen.get(screen.id) ?? [];
                return (
                  <div
                    key={screen.id}
                    className="group flex border-b border-white/[0.05] last:border-b-0"
                  >
                    <div className="sticky left-0 z-10 flex w-44 shrink-0 items-center justify-between gap-2 border-r border-white/[0.07] bg-ink-950 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-100">{screen.name}</p>
                        <p className="text-[11px] text-ink-500">
                          {screen.formats.join(' · ')} · {screen.seats}
                        </p>
                      </div>
                      <Link
                        href={adminScheduleHref({ theater: theater.id, screen: screen.id })}
                        aria-label={`Schedule on ${theater.name}, ${screen.name}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-400 opacity-60 transition hover:bg-white/[0.06] hover:text-ink-50 group-hover:opacity-100 motion-reduce:transition-none"
                      >
                        <PlusIcon className="h-4 w-4" />
                      </Link>
                    </div>
                    <div className="relative h-[68px] flex-1">
                      {hours.map((minute) => (
                        <span
                          key={minute}
                          aria-hidden="true"
                          style={{ left: at(minute) }}
                          className="absolute inset-y-0 w-px bg-white/[0.04]"
                        />
                      ))}
                      {nowMinute !== null && nowMinute >= axisStart && nowMinute <= axisEnd ? (
                        <span
                          aria-hidden="true"
                          style={{ left: at(nowMinute) }}
                          className="absolute inset-y-0 z-[1] w-0.5 bg-brand-400/80"
                        />
                      ) : null}
                      {lane.length === 0 ? (
                        <span className="absolute inset-y-0 left-3 flex items-center text-xs text-ink-600">
                          No shows
                        </span>
                      ) : null}
                      {lane.map((show) => {
                        const start = minutes(show.startsAt);
                        const end = minutes(show.endsAt);
                        const ended = show.state === 'ENDED';
                        return (
                          <div key={show.id}>
                            <span
                              aria-hidden="true"
                              style={{
                                left: at(end),
                                width: `${(TURNAROUND / span) * 100}%`,
                              }}
                              className="absolute inset-y-2 rounded-r-md bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.07)_0_4px,transparent_4px_8px)]"
                            />
                            <Link
                              href={adminShowHref(show.id)}
                              title={`${show.movie.title} · ${clock12(show.time)} · ${show.seats.sold}/${show.seats.total} sold`}
                              style={{ left: at(start), width: `${((end - start) / span) * 100}%` }}
                              className={`absolute inset-y-2 z-[2] overflow-hidden rounded-lg border px-2 py-1 text-left transition motion-reduce:transition-none ${TONE[show.availability]} ${
                                ended ? 'opacity-50' : ''
                              }`}
                            >
                              <p className="truncate text-[11px] font-semibold tabular-nums text-ink-50">
                                {clock12(show.time)} · {show.format}
                              </p>
                              <p className="truncate text-xs text-ink-100">{show.movie.title}</p>
                              <p className="truncate text-[10px] tabular-nums text-ink-300">
                                {show.seats.sold}/{show.seats.total} sold
                              </p>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {theaters.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">
              No theaters match these filters.
            </p>
          ) : null}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-400">
        {(
          [
            ['AVAILABLE', 'Plenty of seats'],
            ['FILLING', 'Filling up'],
            ['ALMOST_FULL', 'Almost full'],
            ['SOLD_OUT', 'Sold out'],
          ] as const
        ).map(([availability, label]) => (
          <li key={availability} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={`h-3 w-5 rounded border ${TONE[availability]}`} />
            {label}
          </li>
        ))}
        <li className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.15)_0_3px,transparent_3px_6px)]"
          />
          Turnaround ({TURNAROUND} min)
        </li>
      </ul>
    </section>
  );
}
