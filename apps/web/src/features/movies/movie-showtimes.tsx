'use client';

import type { MovieShowtimes, Showtime } from '@cineseat/shared';
import { MapPinIcon } from '../../components/ui/icons';
import { dayInfo } from '../catalog/format';
import { AVAILABILITY_LABEL, ShowtimeButton, canBook } from './showtime-button';

type Props = {
  schedule: MovieShowtimes | undefined;
  failed: boolean;
  onRetry: () => void;
  /** Cities to offer, A–Z. */
  cities: string[];
  city: string | null;
  /** The day on screen (see `resolveDay`). */
  day: string | null;
  selectedId: string | null;
  now: number | null;
  /** Theater id → "street, city", once the theater list has loaded. */
  addresses: Map<string, string>;
  onCity: (city: string | null) => void;
  onDay: (date: string) => void;
  onSelect: (id: string | null) => void;
};

/**
 * The day to show: the one the visitor picked, else the picked show's day, else
 * the first day that still has a bookable show in the city (this afternoon's
 * matinees may have started), else the first day of the schedule.
 */
export function resolveDay(
  schedule: MovieShowtimes | undefined,
  picked: string | null,
  selected: Showtime | null,
  city: string | null,
  now: number | null,
): string | null {
  const days = schedule?.days ?? [];
  if (picked && days.some((d) => d.date === picked)) return picked;
  if (selected) return selected.date;
  const shows = inCity(schedule?.shows ?? [], city);
  return (
    days.find((d) => shows.some((show) => show.date === d.date && canBook(show, now)))?.date ??
    days[0]?.date ??
    null
  );
}

const inCity = (shows: Showtime[], city: string | null) =>
  city ? shows.filter((show) => show.theater.city === city) : shows;

/** A week of showtimes: city switch, day strip, then every cinema's times for that day. */
export function ShowtimesPanel({
  schedule,
  failed,
  onRetry,
  cities,
  city,
  day,
  selectedId,
  now,
  addresses,
  onCity,
  onDay,
  onSelect,
}: Props) {
  const shows = inCity(schedule?.shows ?? [], city);
  const byTheater = groupByTheater(shows.filter((show) => show.date === day));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label">Tickets</p>
          <h2
            id="showtimes-title"
            className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl"
          >
            Showtimes
          </h2>
        </div>
        {cities.length > 1 ? (
          <div
            role="group"
            aria-label="City"
            className="flex rounded-full border border-white/10 p-1 text-sm"
          >
            {[null, ...cities].map((item) => (
              <button
                key={item ?? 'all'}
                type="button"
                aria-pressed={city === item}
                onClick={() => onCity(item)}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition motion-reduce:transition-none ${city === item ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-ink-50'}`}
              >
                {item ?? 'All cities'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {failed && !schedule ? (
        <p className="mt-6 rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-ink-400">
          Couldn’t load showtimes right now.{' '}
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold text-brand-300 hover:text-brand-200"
          >
            Try again
          </button>
        </p>
      ) : !schedule ? (
        <ShowtimesSkeleton />
      ) : (
        <>
          <div role="group" aria-label="Day" className="rail mt-6 gap-2 sm:gap-2.5">
            {schedule.days.map(({ date }) => {
              const info = dayInfo(date);
              const count = shows.filter((show) => show.date === date).length;
              const active = day === date;
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={active}
                  disabled={count === 0}
                  onClick={() => onDay(date)}
                  className={`flex w-[4.75rem] shrink-0 snap-start flex-col items-center rounded-2xl border py-3 transition disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none ${
                    active
                      ? 'border-brand-400 bg-brand-600 text-white shadow-glow'
                      : 'border-white/10 bg-white/[0.03] text-ink-200 hover:border-white/25'
                  }`}
                >
                  {/* Full-strength text on the selected (pink) chip keeps the small labels legible. */}
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${active ? '' : 'text-ink-400'}`}
                  >
                    {info.offset === 0 ? 'Today' : info.weekday}
                  </span>
                  <span className="font-display text-2xl font-semibold leading-tight">
                    {info.day}
                  </span>
                  <span className={`text-[10px] ${active ? '' : 'text-ink-400'}`}>
                    {count === 0 ? info.month : `${count} ${count === 1 ? 'show' : 'shows'}`}
                  </span>
                </button>
              );
            })}
          </div>

          {byTheater.length === 0 ? (
            <p className="mt-6 rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-ink-400">
              {schedule.shows.length === 0
                ? 'No shows are scheduled for this movie yet. Check back soon.'
                : `No shows ${city ? `in ${city} ` : ''}on this day. Try another date${city ? ' or all cities' : ''}.`}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {byTheater.map(({ theater, shows: list }) => (
                <li key={theater.id} className="card rounded-3xl p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-sans text-base font-semibold text-ink-50">
                      {theater.name}
                    </h3>
                    <p className="flex items-center gap-1.5 text-xs text-ink-400">
                      <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                      {addresses.get(theater.id) ?? theater.city}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {list.map((show) => (
                      <ShowtimeButton
                        key={show.id}
                        show={show}
                        now={now}
                        selected={selectedId === show.id}
                        onSelect={() => onSelect(selectedId === show.id ? null : show.id)}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
        {(['AVAILABLE', 'FILLING', 'ALMOST_FULL'] as const).map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${state === 'AVAILABLE' ? 'bg-emerald-400' : state === 'FILLING' ? 'bg-gold-400' : 'bg-brand-400'}`}
            />
            {AVAILABILITY_LABEL[state]}
          </span>
        ))}
        <span>Times are local cinema time.</span>
      </p>
    </div>
  );
}

export function ShowtimesSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading showtimes</span>
      <div aria-hidden="true" className="mt-6 flex gap-2.5 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-[86px] w-[4.75rem] shrink-0 rounded-2xl bg-white/[0.05]" />
        ))}
      </div>
      <div aria-hidden="true" className="mt-6 space-y-3">
        <div className="h-32 rounded-3xl bg-white/[0.03]" />
        <div className="h-32 rounded-3xl bg-white/[0.03]" />
      </div>
    </div>
  );
}

/** Shows of one day, per cinema (cinemas A–Z, shows by start time). */
function groupByTheater(shows: Showtime[]) {
  const groups = new Map<string, { theater: Showtime['theater']; shows: Showtime[] }>();
  for (const show of shows) {
    const group = groups.get(show.theater.id) ?? { theater: show.theater, shows: [] };
    group.shows.push(show);
    groups.set(show.theater.id, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.theater.name.localeCompare(b.theater.name))
    .map((group) => ({
      ...group,
      shows: group.shows.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }));
}
