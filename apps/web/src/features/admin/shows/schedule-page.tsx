'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MAX_BATCH_SHOWS,
  SEAT_SURCHARGE,
  ShowFormat,
  type AdminMovie,
  type ScheduleShowsInput,
} from '@cineseat/shared';
import { CheckIcon, CloseIcon, PlusIcon } from '../../../components/ui/icons';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { Field, describedBy } from '../../account/settings/form-kit';
import { CINEMA_TIME_ZONE, cinemaToday, money, runtime } from '../../catalog/format';
import { useCatalogFilters } from '../../catalog/queries';
import { ADMIN_ROUTES, adminShowHref, adminShowsHref } from '../links';
import { useAdminMovies } from '../movies/queries';
import { StatusBadge } from '../movies/bits';
import { useAllTheaters } from '../theaters/queries';
import { useToast } from '../toaster';
import { PosterThumb, Tag } from '../ui/bits';
import { CardChoice, FormErrorBanner, Section } from '../ui/form-kit';
import {
  addDays,
  clock12,
  datesBetween,
  plural,
  shortDate,
  toMinor,
  weekdayDate,
  weekdayIndex,
} from '../ui/format';
import { BackLink } from '../ui/page-kit';
import { useAdminShows, useSchedulePreview, useScheduleShows } from './queries';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** The slots the cinemas usually run (a tap adds one). */
const USUAL_TIMES = ['11:30', '14:45', '18:00', '21:15'];
const MAX_DATES = 31;

/**
 * `/admin/shows/new`: one movie on one screen at every chosen time of every
 * chosen day — a whole week in one go. Each change asks the API for a dry run
 * (POST /shows/batch with `dryRun`), so the preview says which shows fit and
 * why the others do not (in the past, before release, a clash on the screen
 * or with another show of the batch) before anything is saved. `?movie=`,
 * `?theater=` and `?screen=` preselect, from the movie, theater and board pages.
 */
export function SchedulePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const now = useNow(60_000);
  const movies = useAdminMovies(user?.id, { sort: 'title', pageSize: 100 });
  const theaters = useAllTheaters(user?.id);
  const languages = useCatalogFilters().data?.languages ?? [];
  const schedule = useScheduleShows(user?.id);

  const [movieId, setMovieId] = useState(params.get('movie') ?? '');
  const [theaterId, setTheaterId] = useState(params.get('theater') ?? '');
  const [screenId, setScreenId] = useState(params.get('screen') ?? '');
  const [format, setFormat] = useState<ShowFormat>('2D');
  const [language, setLanguage] = useState('');
  const [price, setPrice] = useState('400');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<boolean[]>(Array(7).fill(true));
  const [times, setTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState('');
  const [error, setError] = useState<string[]>([]);

  // The default window is the coming week, on the cinemas' clock (known after hydration).
  const today = now ? cinemaToday(now) : null;
  useEffect(() => {
    if (today && from === null) {
      setFrom(today);
      setTo(addDays(today, 6));
    }
  }, [today, from]);

  const movie = movies.data?.items.find((item) => item.id === movieId) ?? null;
  const allTheaters = theaters.data?.items ?? [];
  // A screen chosen by link brings its theater along.
  const theater =
    allTheaters.find((item) => item.id === theaterId) ??
    allTheaters.find((item) => item.screens.some((screen) => screen.id === screenId)) ??
    null;
  const screen = theater?.screens.find((item) => item.id === screenId) ?? null;
  const formats = ShowFormat.options.filter(
    (option) =>
      (!movie || movie.formats.includes(option)) && (!screen || screen.formats.includes(option)),
  );

  // Keep the choices consistent as the movie and screen change.
  useEffect(() => {
    if (movie && !language) setLanguage(movie.language);
  }, [movie, language]);
  useEffect(() => {
    if (formats.length && !formats.includes(format)) setFormat(formats[0]);
  }, [formats, format]);

  const dates = useMemo(
    () =>
      from && to && from <= to
        ? datesBetween(from, to, 93)
            .filter((date) => weekdays[weekdayIndex(date)])
            .slice(0, MAX_DATES)
        : [],
    [from, to, weekdays],
  );
  const basePrice = toMinor(price);
  const missing = [
    !movie && 'a movie',
    !screen && 'a screen',
    !formats.length && 'a format both support',
    !(Number.isInteger(basePrice) && basePrice >= 0) && 'a price',
    !dates.length && 'at least one day',
    !times.length && 'at least one time',
  ].filter(Boolean) as string[];
  const total = dates.length * times.length;
  const tooMany = total > MAX_BATCH_SHOWS;

  const input: ScheduleShowsInput | null =
    missing.length || tooMany || !movie || !screen
      ? null
      : {
          movieId: movie.id,
          screenId: screen.id,
          format,
          language: language.trim() || undefined,
          basePrice,
          dates,
          times: [...times].sort(),
          dryRun: true,
        };
  const debounced = useDebounced(input, 400);
  const preview = useSchedulePreview(user?.id, debounced);
  const fresh = preview.data && JSON.stringify(debounced) === JSON.stringify(input);
  const existing = useAdminShows(
    user?.id,
    {
      screen: screen ? [screen.id] : [],
      when: 'all',
      from: dates[0],
      to: dates[dates.length - 1],
      pageSize: 100,
    },
    { enabled: Boolean(screen && dates.length) },
  );

  const addTime = (time: string) => {
    if (/^\d{2}:\d{2}$/.test(time) && !times.includes(time)) setTimes([...times, time].sort());
    setNewTime('');
  };

  const submit = () => {
    if (!input || !fresh || !preview.data?.created) return;
    setError([]);
    schedule.mutate(input, {
      onSuccess: (result) => {
        toast({
          message: `${plural(result.created, 'show')} scheduled`,
          detail: result.failed
            ? `${plural(result.failed, 'slot')} could not be: the schedule changed meanwhile.`
            : `${movie!.title} on ${theater!.name}, ${screen!.name}.`,
        });
        router.push(adminShowsHref({ movie: movie!.id, screen: screen!.id }));
      },
      onError: (failure) => setError([failure.message]),
    });
  };

  return (
    <div className="flex flex-col gap-6 pb-16">
      <header>
        <BackLink href={ADMIN_ROUTES.shows}>Showtimes</BackLink>
        <h1 className="mt-2 font-display text-3xl text-ink-50 sm:text-4xl">Schedule shows</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          One movie on one screen, at every time of every chosen day. Times are on the cinemas’
          clock ({CINEMA_TIME_ZONE}). Nothing is saved until you confirm.
        </p>
      </header>

      <FormErrorBanner title="Couldn’t schedule the shows" messages={error} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section
            title="Movie"
            description="Only what is released in a format can be shown in it."
          >
            <Field id="schedule-movie" label="Movie">
              <select
                id="schedule-movie"
                value={movieId}
                onChange={(event) => {
                  setMovieId(event.target.value);
                  setLanguage('');
                }}
                className="select"
              >
                <option value="">Choose a movie…</option>
                {(['NOW_SHOWING', 'COMING_SOON'] as const).map((status) => (
                  <optgroup
                    key={status}
                    label={status === 'NOW_SHOWING' ? 'Now showing' : 'Coming soon'}
                  >
                    {(movies.data?.items ?? [])
                      .filter((item) => item.status === status)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            {movie ? <MovieSummary movie={movie} today={today} /> : null}
          </Section>

          <Section
            title="Screen"
            description="Where it plays; the screen must be able to show the format."
          >
            <Field id="schedule-theater" label="Theater">
              <select
                id="schedule-theater"
                value={theater?.id ?? ''}
                onChange={(event) => {
                  setTheaterId(event.target.value);
                  setScreenId('');
                }}
                className="select"
              >
                <option value="">Choose a theater…</option>
                {allTheaters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.city}
                  </option>
                ))}
              </select>
            </Field>
            {theater ? (
              theater.screens.length ? (
                <Field id="schedule-screen" label="Screen">
                  <CardChoice
                    id="schedule-screen"
                    label="Screen"
                    type="radio"
                    options={theater.screens.map((item) => ({
                      value: item.id,
                      title: item.name,
                      text: `${item.formats.join(' · ')} · ${plural(item.seats, 'seat')}`,
                    }))}
                    chosen={screen ? [screen.id] : []}
                    onToggle={setScreenId}
                  />
                </Field>
              ) : (
                <p className="text-sm text-ink-400">This theater has no screens yet.</p>
              )
            ) : null}
          </Section>

          <Section title="Show details" description="The same for every show of this batch.">
            <Field id="schedule-format" label="Format" hint={formatHint(movie, screen)}>
              <CardChoice
                id="schedule-format"
                label="Format"
                type="radio"
                options={ShowFormat.options.map((option) => ({
                  value: option,
                  title: option,
                  text: formats.includes(option)
                    ? option === '3D'
                      ? 'Glasses at the door'
                      : 'Standard projection'
                    : 'Not available here',
                  locked: !formats.includes(option),
                }))}
                chosen={[format]}
                onToggle={setFormat}
              />
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field id="schedule-language" label="Language" hint="The movie’s, unless dubbed.">
                <input
                  id="schedule-language"
                  list="schedule-language-options"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  maxLength={40}
                  autoComplete="off"
                  className="input"
                  aria-describedby={describedBy('schedule-language', { hint: true })}
                />
                <datalist id="schedule-language-options">
                  {languages.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </Field>
              <Field
                id="schedule-price"
                label="Base price"
                hint={
                  Number.isInteger(basePrice) && basePrice >= 0
                    ? `Premium ${money(basePrice + SEAT_SURCHARGE.PREMIUM)} · recliner ${money(basePrice + SEAT_SURCHARGE.RECLINER)}`
                    : 'Standard seat, in taka'
                }
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                    ৳
                  </span>
                  <input
                    id="schedule-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={10}
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="input pl-8"
                    aria-describedby={describedBy('schedule-price', { hint: true })}
                  />
                </div>
              </Field>
            </div>
          </Section>

          <Section
            title="Days and times"
            description={`Up to ${MAX_DATES} days and ${MAX_BATCH_SHOWS} shows at once.`}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field id="schedule-from" label="From">
                <input
                  id="schedule-from"
                  type="date"
                  value={from ?? ''}
                  min={today ?? undefined}
                  onChange={(event) => {
                    setFrom(event.target.value || null);
                    if (event.target.value && to && event.target.value > to)
                      setTo(event.target.value);
                  }}
                  className="input"
                />
              </Field>
              <Field id="schedule-to" label="To">
                <input
                  id="schedule-to"
                  type="date"
                  value={to ?? ''}
                  min={from ?? undefined}
                  onChange={(event) => setTo(event.target.value || null)}
                  className="input"
                />
              </Field>
            </div>
            <fieldset>
              <legend className="field-label">On these days</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={weekdays[index]}
                    onClick={() => setWeekdays(weekdays.map((on, i) => (i === index ? !on : on)))}
                    className="pill py-1.5"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="field-hint">
                {dates.length
                  ? `${plural(dates.length, 'day')}: ${dates.length <= 4 ? dates.map(weekdayDate).join(', ') : `${weekdayDate(dates[0])} to ${weekdayDate(dates[dates.length - 1])}`}`
                  : 'No day matches these choices.'}
              </p>
            </fieldset>
            <fieldset>
              <legend className="field-label">Start times</legend>
              <div className="flex flex-wrap items-center gap-2">
                {times.map((time) => (
                  <span
                    key={time}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/[0.07] py-1 pl-2.5 pr-1 text-sm tabular-nums text-ink-100"
                  >
                    {clock12(time)}
                    <button
                      type="button"
                      onClick={() => setTimes(times.filter((item) => item !== time))}
                      aria-label={`Remove ${clock12(time)}`}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-white/10 hover:text-ink-50"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <label htmlFor="schedule-time" className="sr-only">
                    Add a start time
                  </label>
                  <input
                    id="schedule-time"
                    type="time"
                    value={newTime}
                    onChange={(event) => setNewTime(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTime(newTime);
                      }
                    }}
                    className="input h-9 w-32 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => addTime(newTime)}
                    disabled={!newTime}
                    className="btn-ghost px-3 py-1.5 disabled:opacity-40"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add
                  </button>
                </span>
              </div>
              <p className="field-hint flex flex-wrap items-center gap-1.5">
                Usual slots:
                {USUAL_TIMES.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => addTime(time)}
                    disabled={times.includes(time)}
                    className="rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-300 hover:border-white/25 hover:text-ink-50 disabled:opacity-40"
                  >
                    {clock12(time)}
                  </button>
                ))}
              </p>
            </fieldset>
          </Section>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
          <section
            aria-labelledby="preview-title"
            aria-busy={preview.isFetching}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-inset"
          >
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h2 id="preview-title" className="text-base font-semibold text-ink-50">
                Preview
              </h2>
              <p className="text-xs text-ink-400" aria-live="polite">
                {missing.length
                  ? `Choose ${missing.join(', ')}.`
                  : tooMany
                    ? `${total} shows is more than ${MAX_BATCH_SHOWS}: fewer days or times.`
                    : !fresh || preview.isFetching
                      ? `Checking ${plural(total, 'show')}…`
                      : preview.data
                        ? `${plural(preview.data.created, 'show')} can be scheduled${preview.data.failed ? ` · ${preview.data.failed} can’t` : ''}`
                        : ''}
              </p>
            </div>
            {preview.isError ? (
              <p className="px-5 py-4 text-sm text-brand-200">{preview.error.message}</p>
            ) : null}
            {input && preview.data ? (
              <PreviewList result={preview.data} dim={!fresh || preview.isFetching} />
            ) : (
              <p className="px-5 py-6 text-sm text-ink-500">
                Each show is checked against the screen’s schedule, the movie’s release and the
                others in this batch.
              </p>
            )}
            <div className="border-t border-white/[0.06] px-5 py-4">
              <button
                type="button"
                onClick={submit}
                disabled={
                  !input ||
                  !fresh ||
                  preview.isFetching ||
                  !preview.data?.created ||
                  schedule.isPending
                }
                className="btn-primary w-full py-2.5 disabled:opacity-50 disabled:shadow-none"
              >
                {schedule.isPending
                  ? 'Scheduling…'
                  : fresh && preview.data?.created
                    ? `Schedule ${plural(preview.data.created, 'show')}`
                    : 'Schedule shows'}
              </button>
            </div>
          </section>

          {screen && dates.length ? (
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-inset">
              <div className="px-5 pb-3 pt-4">
                <h2 className="text-sm font-semibold text-ink-50">
                  Already on {screen.name}, {shortDate(dates[0])} –{' '}
                  {shortDate(dates[dates.length - 1])}
                </h2>
                <p className="text-xs text-ink-400">
                  {existing.data ? plural(existing.data.total, 'show') : 'Loading…'}
                </p>
              </div>
              {existing.data?.items.length ? (
                <ul className="max-h-72 divide-y divide-white/[0.05] overflow-y-auto border-t border-white/[0.05] text-sm">
                  {existing.data.items.map((show) => (
                    <li key={show.id}>
                      <Link
                        href={adminShowHref(show.id)}
                        className="flex items-center gap-3 px-5 py-2 hover:bg-white/[0.03]"
                      >
                        <span className="w-28 shrink-0 tabular-nums text-ink-300">
                          {weekdayDate(show.date)}
                        </span>
                        <span className="w-16 shrink-0 tabular-nums text-ink-100">
                          {clock12(show.time)}
                        </span>
                        <span className="min-w-0 truncate text-ink-400">{show.movie.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MovieSummary({ movie, today }: { movie: AdminMovie; today: string | null }) {
  const notYet = today !== null && movie.releaseDate > today;
  return (
    <div className="flex gap-4 rounded-xl border border-white/[0.07] bg-ink-950/50 p-3">
      <PosterThumb movie={movie} className="w-14" />
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink-50">{movie.title}</span>
          <StatusBadge status={movie.status} />
        </p>
        <p className="mt-1 text-xs text-ink-400">
          {runtime(movie.durationMin)} · {movie.language} · releases {shortDate(movie.releaseDate)}
        </p>
        <p className="mt-1.5 flex gap-1">
          {movie.formats.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </p>
        {notYet ? (
          <p className="mt-1.5 text-xs text-gold-300">
            Shows can start from {shortDate(movie.releaseDate)}, its release day.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatHint(movie: AdminMovie | null, screen: { formats: string[] } | null): ReactNode {
  if (!movie || !screen) return 'The movie and the screen must both support it.';
  return `Released in ${movie.formats.join(' and ')}; the screen shows ${screen.formats.join(' and ')}.`;
}

/** The dry run's answer, day by day: each time fits (✓) or says why not. */
function PreviewList({
  result,
  dim,
}: {
  result: { results: { date: string; time: string; error: string | null }[] };
  dim: boolean;
}) {
  const days = new Map<string, { time: string; error: string | null }[]>();
  for (const slot of result.results) days.set(slot.date, [...(days.get(slot.date) ?? []), slot]);
  return (
    <ol
      className={`max-h-[28rem] divide-y divide-white/[0.05] overflow-y-auto transition-opacity motion-reduce:transition-none ${dim ? 'opacity-50' : ''}`}
    >
      {[...days.entries()].map(([date, slots]) => (
        <li key={date} className="px-5 py-3">
          <p className="text-xs font-semibold text-ink-300">{weekdayDate(date)}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {slots.map((slot) => (
              <li key={slot.time} className="flex items-start gap-2 text-sm">
                {slot.error ? (
                  <CloseIcon
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-300"
                    aria-label="Can’t be scheduled"
                  />
                ) : (
                  <CheckIcon
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300"
                    aria-label="Fits"
                  />
                )}
                <span className="w-16 shrink-0 tabular-nums text-ink-100">
                  {clock12(slot.time)}
                </span>
                <span
                  className={`min-w-0 text-xs leading-5 ${slot.error ? 'text-brand-200/90' : 'text-ink-500'}`}
                >
                  {slot.error ? slot.error.replace(/^[a-zA-Z]+: /, '') : 'Fits'}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** `value`, once it has stopped changing for `ms` (compared by content). */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(JSON.parse(key) as T), ms);
    return () => window.clearTimeout(timer);
  }, [key, ms]);
  return settled;
}
