'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { MAX_SEATS_PER_BOOKING, type MovieShowtimes, type Showtime } from '@cineseat/shared';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  HeartIcon,
  PlayIcon,
  SeatIcon,
  ShieldIcon,
  StarIcon,
  TicketIcon,
} from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { useNow } from '../../hooks/use-now';
import { useWatchlist } from '../../hooks/use-watchlist';
import { ApiClientError } from '../../lib/api';
import type { CatalogMovie } from '../catalog/art';
import {
  cinemaToday,
  compact,
  dayInfo,
  daysBetween,
  longDate,
  money,
  releaseLabel,
  runtime,
  time12,
} from '../catalog/format';
import { movieHref } from '../catalog/links';
import { MovieCard } from '../catalog/movie-card';
import { PosterArt } from '../catalog/poster-art';
import {
  useCatalogFilters,
  useMovie,
  useMovieShowtimes,
  useMovies,
  useTheaters,
} from '../catalog/queries';
import { CERTIFICATE_LABEL } from '../landing/content';
import { MovieNotFound } from './movie-not-found';
import { ShowtimesPanel, ShowtimesSkeleton, resolveDay } from './movie-showtimes';
import { canBook } from './showtime-button';

/** What the showtimes start on; kept in the URL so a refresh or a shared link restores it. */
export type Selection = {
  city: string | null;
  /** `YYYY-MM-DD` on the cinemas' clock. */
  date: string | null;
  /** Showtime id. */
  show: string | null;
};

type Props = {
  movieId: string;
  /** Rendered on the server, so the page paints complete; null when the API could not be reached. */
  initialMovie: CatalogMovie | null;
  initialSelection: Selection;
};

const theaterShortName = (name: string) => name.replace('CineSeat ', '');

/**
 * A movie's page. The movie itself comes from the server render; showtimes and
 * availability are live data, fetched in the browser and refreshed every minute.
 */
export function MovieDetails({ movieId, initialMovie, initialSelection }: Props) {
  const query = useMovie(movieId, initialMovie ?? undefined);

  if (query.data) return <Details movie={query.data} initialSelection={initialSelection} />;
  if (query.error instanceof ApiClientError && query.error.status === 404) return <MovieNotFound />;
  if (query.isError) {
    return (
      <div className="container-x flex flex-col items-center py-24 text-center sm:py-32">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          Couldn’t load this movie
        </h1>
        <p className="mt-3 max-w-md text-ink-400">{query.error.message}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => void query.refetch()} className="btn-primary">
            Try again
          </button>
          <Link href="/movies" className="btn-ghost">
            Back to movies
          </Link>
        </div>
      </div>
    );
  }
  return <DetailsSkeleton />;
}

function Details({
  movie,
  initialSelection,
}: {
  movie: CatalogMovie;
  initialSelection: Selection;
}) {
  const hydrated = useHydrated();
  const now = useNow();
  const { has, toggle } = useWatchlist();
  const [selection, select] = useSelection(initialSelection);
  const upcoming = movie.status === 'COMING_SOON';

  // Coming-soon titles have no schedule yet; nothing to ask for.
  const schedule = useMovieShowtimes(upcoming ? null : movie.id);
  const filters = useCatalogFilters();
  const theaters = useTheaters();

  const shows = useMemo(() => schedule.data?.shows ?? [], [schedule.data]);
  const selected = shows.find((show) => show.id === selection.show) ?? null;
  const cities =
    filters.data?.cities ?? [...new Set(shows.map((show) => show.theater.city))].sort();
  const addresses = useMemo(
    () => new Map(theaters.data?.map((t) => [t.id, `${t.address}, ${t.city}`])),
    [theaters.data],
  );
  const day = resolveDay(schedule.data, selection.date, selected, selection.city, now);

  return (
    <div>
      <Hero movie={movie} saved={has(movie.id)} onToggleSaved={() => toggle(movie.id)} />

      <div className="container-x grid gap-x-12 gap-y-14 pt-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-16">
          {upcoming ? (
            <Release movie={movie} saved={has(movie.id)} onToggleSaved={() => toggle(movie.id)} />
          ) : (
            <section id="showtimes" aria-labelledby="showtimes-title">
              {/* Live data: drawn in the browser only, so the server HTML never disagrees with it. */}
              {hydrated ? (
                <ShowtimesPanel
                  schedule={schedule.data}
                  failed={schedule.isError}
                  onRetry={() => void schedule.refetch()}
                  cities={cities}
                  city={selection.city}
                  day={day}
                  selectedId={selected?.id ?? null}
                  now={now}
                  addresses={addresses}
                  onCity={(city) => select({ city })}
                  onDay={(date) => select({ date })}
                  onSelect={(show) => select({ show })}
                />
              ) : (
                <>
                  <p className="section-label">Tickets</p>
                  <h2
                    id="showtimes-title"
                    className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl"
                  >
                    Showtimes
                  </h2>
                  <ShowtimesSkeleton />
                </>
              )}
            </section>
          )}
          <CastAndCrew movie={movie} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <FactSheet movie={movie} />
          {upcoming ? null : <BeforeYouBook schedule={schedule.data} />}
        </aside>
      </div>

      <MoreLikeThis movie={movie} />

      {selected && canBook(selected, now) ? (
        <BookingBar movie={movie} show={selected} onClear={() => select({ show: null })} />
      ) : null}
    </div>
  );
}

/**
 * Selection state mirrored into the URL with `replaceState`: picking a day or a
 * time adds no history entry (Back still leaves the page) but a refresh, or the
 * copied link, opens on the same showtime.
 */
function useSelection(initial: Selection) {
  const [selection, setSelection] = useState(initial);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ['city', 'date', 'show'] as const) {
      const value = selection[key];
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [selection]);

  const select = useCallback(
    (patch: Partial<Selection>) => setSelection((current) => ({ ...current, ...patch })),
    [],
  );
  return [selection, select] as const;
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({
  movie,
  saved,
  onToggleSaved,
}: {
  movie: CatalogMovie;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  const upcoming = movie.status === 'COMING_SOON';
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const longStory = movie.description.length > 280;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: nothing to report */
    }
  };

  return (
    <section
      aria-labelledby="movie-title"
      className="relative -mt-16 overflow-hidden sm:-mt-[72px]"
    >
      {/* The key art, blown up behind everything; the header floats over it like on home. */}
      <div aria-hidden="true" className="absolute inset-0">
        <PosterArt
          movie={movie}
          variant="backdrop"
          showTitle={false}
          className="h-full w-full blur-[2px] saturate-[1.15] animate-ken-burns motion-reduce:animate-none"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-ink-950/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/60" />
      </div>

      <div className="container-x relative pb-14 pt-24 sm:pt-28 lg:pb-20 lg:pt-32">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-sm text-ink-400">
            <li>
              <Link href="/movies" className="hover:text-ink-100">
                Movies
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </li>
            <li>
              <Link href={upcoming ? '/movies?tab=soon' : '/movies'} className="hover:text-ink-100">
                {upcoming ? 'Coming soon' : 'Now showing'}
              </Link>
            </li>
            <li aria-hidden="true" className="hidden sm:block">
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </li>
            <li aria-current="page" className="hidden truncate text-ink-200 sm:block">
              {movie.title}
            </li>
          </ol>
        </nav>

        <div className="mt-8 grid items-end gap-8 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-12">
          <PosterArt
            movie={movie}
            credit
            className="aspect-[2/3] w-40 rounded-3xl text-sm shadow-lift ring-1 ring-white/15 xs:w-48 md:w-full md:text-base lg:text-lg"
          />

          <div className="min-w-0 animate-fade-up motion-reduce:animate-none">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              {/* Relative to today on the cinemas' clock; only differs across midnight. */}
              <span suppressHydrationWarning>
                {upcoming ? releaseLabel(movie.releaseDate) : 'Now showing'}
              </span>
            </p>

            <h1
              id="movie-title"
              className="mt-5 text-[2.6rem] font-semibold leading-[1] tracking-tight text-white xs:text-5xl sm:text-6xl lg:text-7xl"
            >
              {movie.title}
            </h1>
            {movie.tagline ? (
              <p className="mt-3 font-display text-xl italic text-ink-200 sm:text-2xl">
                {movie.tagline}
              </p>
            ) : null}

            <ul
              aria-label="At a glance"
              className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-300"
            >
              {movie.rating !== null ? (
                <li className="flex items-center gap-1.5">
                  <StarIcon className="h-4 w-4 text-gold-400" />
                  <span className="font-semibold text-white">{movie.rating.toFixed(1)}</span>
                  <span className="text-ink-400">/ 5 · {compact(movie.votes)} ratings</span>
                </li>
              ) : (
                <li className="flex items-center gap-1.5">
                  <HeartIcon filled className="h-4 w-4 text-brand-400" />
                  <span className="font-semibold text-white">
                    {compact(movie.interested + (saved ? 1 : 0))}
                  </span>
                  interested
                </li>
              )}
              <li
                title={CERTIFICATE_LABEL[movie.certificate]}
                className="rounded border border-white/25 px-1.5 text-xs font-bold text-white"
              >
                {movie.certificate}
              </li>
              <li>{runtime(movie.durationMin)}</li>
              <li>{movie.language}</li>
              <li className="flex gap-1">
                {movie.formats.map((format) => (
                  <span
                    key={format}
                    className="rounded bg-white/10 px-1.5 text-xs font-semibold text-white"
                  >
                    {format}
                  </span>
                ))}
              </li>
            </ul>

            <div className="mt-5 max-w-2xl">
              <p
                className={`text-base leading-relaxed text-ink-200 sm:text-lg ${longStory && !expanded ? 'line-clamp-4' : ''}`}
              >
                {movie.description}
              </p>
              {longStory ? (
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                  className="mt-1 text-sm font-semibold text-brand-300 hover:text-brand-200"
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {upcoming ? (
                <button
                  type="button"
                  onClick={onToggleSaved}
                  aria-pressed={saved}
                  className="btn-primary px-6 py-3.5 text-[15px]"
                >
                  <HeartIcon filled={saved} className="h-5 w-5" />
                  {saved ? 'On your watchlist' : 'Add to watchlist'}
                </button>
              ) : (
                <a href="#showtimes" className="btn-primary px-6 py-3.5 text-[15px]">
                  <TicketIcon className="h-5 w-5" />
                  Get tickets
                </a>
              )}
              {upcoming ? null : (
                <button
                  type="button"
                  onClick={onToggleSaved}
                  aria-pressed={saved}
                  className="btn-ghost border-white/15 bg-white/[0.06] px-5 py-3.5 text-[15px] backdrop-blur hover:bg-white/[0.1]"
                >
                  <HeartIcon
                    filled={saved}
                    className={`h-5 w-5 ${saved ? 'text-brand-400' : ''}`}
                  />
                  {saved ? 'On your watchlist' : 'Add to watchlist'}
                </button>
              )}
              {movie.trailerUrl ? (
                <a
                  href={movie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost border-white/15 bg-white/[0.06] px-5 py-3.5 text-[15px] backdrop-blur hover:bg-white/[0.1]"
                >
                  <PlayIcon className="h-4 w-4" />
                  Trailer
                </a>
              ) : null}
              <button
                type="button"
                onClick={share}
                className="btn-icon h-12 w-12 border-white/15 bg-white/[0.06] backdrop-blur"
                aria-label={copied ? 'Link copied' : 'Copy link to this movie'}
                title={copied ? 'Link copied' : 'Copy link'}
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-emerald-400" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Coming soon ───────────────────────────────────────────────────────────────

function Release({
  movie,
  saved,
  onToggleSaved,
}: {
  movie: CatalogMovie;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  const now = useNow();
  // Counted on the browser's clock only, so it never disagrees with the server HTML.
  const daysLeft = now === null ? null : daysBetween(cinemaToday(now), movie.releaseDate);

  return (
    <section aria-labelledby="release-title">
      <p className="section-label">Release</p>
      <h2
        id="release-title"
        className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl"
      >
        In cinemas soon
      </h2>
      <div className="card relative mt-6 overflow-hidden rounded-3xl p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
              <CalendarIcon className="h-4 w-4" /> Release date
            </p>
            <p className="mt-3 font-display text-4xl font-semibold text-ink-50 sm:text-5xl">
              {longDate(movie.releaseDate)}
            </p>
            {daysLeft !== null && daysLeft > 0 ? (
              <p className="mt-2 text-sm text-ink-300">
                {daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`} ·{' '}
                {dayInfo(movie.releaseDate).weekday}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onToggleSaved}
            aria-pressed={saved}
            className={`btn-ghost ${saved ? 'border-brand-500/60 bg-brand-500/15' : ''}`}
          >
            <HeartIcon filled={saved} className={`h-4 w-4 ${saved ? 'text-brand-300' : ''}`} />
            {saved ? 'On your watchlist' : 'Add to watchlist'}
          </button>
        </div>
        <p className="relative mt-6 max-w-xl text-sm leading-relaxed text-ink-400">
          Showtimes appear on this page as soon as the schedule is out. Add it to your watchlist to
          find it again quickly.
        </p>
        <p className="relative mt-4 flex items-center gap-2 text-sm text-ink-300">
          <HeartIcon filled className="h-4 w-4 text-brand-400" />
          {compact(movie.interested + (saved ? 1 : 0))} people are interested
        </p>
      </div>
    </section>
  );
}

// ── About ─────────────────────────────────────────────────────────────────────

function CastAndCrew({ movie }: { movie: CatalogMovie }) {
  const people = [
    ...(movie.director ? [{ name: movie.director, role: 'Director' }] : []),
    ...movie.cast.map((name) => ({ name, role: 'Cast' })),
  ];
  if (people.length === 0) return null;
  const [, mid, glow] = movie.art.palette;

  return (
    <section aria-labelledby="cast-title">
      <h2 id="cast-title" className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
        Cast &amp; crew
      </h2>
      <ul className="mt-6 grid grid-cols-1 gap-3 xs:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => (
          <li
            key={`${person.role}-${person.name}`}
            className="flex items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
          >
            {/* No headshots yet: initials on the film's own palette. */}
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-base font-semibold text-white ring-1 ring-white/15"
              style={{ backgroundImage: `linear-gradient(135deg, ${mid}, ${glow}66)` }}
            >
              {initials(person.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink-50">
                {person.name}
              </span>
              <span className="block text-xs text-ink-400">{person.role}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase();
}

function FactSheet({ movie }: { movie: CatalogMovie }) {
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: 'Genres',
      value: (
        <span className="flex flex-wrap gap-1.5">
          {movie.genres.map((genre) => (
            <Link
              key={genre}
              href={`/movies?tab=all&genre=${encodeURIComponent(genre)}`}
              className="chip transition hover:border-ink-500 hover:text-ink-50"
            >
              {genre}
            </Link>
          ))}
        </span>
      ),
    },
    { label: 'Language', value: movie.language },
    { label: 'Runtime', value: `${runtime(movie.durationMin)} (${movie.durationMin} min)` },
    { label: 'Release', value: longDate(movie.releaseDate) },
    {
      label: 'Rated',
      value: (
        <>
          <span className="font-semibold">{movie.certificate}</span> ·{' '}
          {CERTIFICATE_LABEL[movie.certificate]}
        </>
      ),
    },
    { label: 'Formats', value: movie.formats.join(' · ') },
  ];

  return (
    <section aria-labelledby="facts-title" className="card rounded-3xl p-6">
      <h2 id="facts-title" className="font-sans text-sm font-semibold text-ink-50">
        Details
      </h2>
      <dl className="mt-4 divide-y divide-white/[0.06] text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[5.5rem_1fr] gap-3 py-3 first:pt-0 last:pb-0"
          >
            <dt className="text-ink-400">{row.label}</dt>
            <dd className="min-w-0 text-ink-100">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Price and reach from the live schedule, plus the rules people ask about before paying. */
function BeforeYouBook({ schedule }: { schedule: MovieShowtimes | undefined }) {
  const shows = schedule?.shows ?? [];
  const from = shows.length ? Math.min(...shows.map((show) => show.priceFrom)) : null;
  const venues = new Set(shows.map((show) => show.theater.id)).size;
  const cities = new Set(shows.map((show) => show.theater.city)).size;

  const items = [
    {
      icon: TicketIcon,
      text:
        from === null
          ? 'Prices appear with the showtimes'
          : `Tickets from ${money(from)} · ${venues} ${venues === 1 ? 'cinema' : 'cinemas'} in ${cities} ${cities === 1 ? 'city' : 'cities'}`,
    },
    { icon: ClockIcon, text: 'Seats are held for you for 5 minutes while you pay' },
    { icon: SeatIcon, text: `Up to ${MAX_SEATS_PER_BOOKING} seats per booking` },
    { icon: ShieldIcon, text: 'Pay by card, bKash or Nagad' },
  ];

  return (
    <section aria-labelledby="before-title" className="card rounded-3xl p-6">
      <h2 id="before-title" className="font-sans text-sm font-semibold text-ink-50">
        Before you book
      </h2>
      <ul className="mt-4 space-y-3 text-sm text-ink-300">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── More like this ───────────────────────────────────────────────────────────

const CELL =
  'w-[44%] shrink-0 snap-start xs:w-[36%] sm:w-[28%] md:w-[22%] lg:w-[calc((100%-5*1.25rem)/6)]';

function MoreLikeThis({ movie }: { movie: CatalogMovie }) {
  const query = useMovies({ genre: movie.genres, sort: 'popular', pageSize: 7 });
  const similar = (query.data?.items ?? []).filter((other) => other.id !== movie.id).slice(0, 6);
  if (query.data && similar.length === 0) return null;
  if (query.isError) return null;

  return (
    <section aria-labelledby="similar-title" className="container-x mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label">If you like {movie.title}</p>
          <h2
            id="similar-title"
            className="mt-2 text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl"
          >
            More like this
          </h2>
        </div>
        <Link
          href={`/movies?tab=all&genre=${encodeURIComponent(movie.genre)}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-300 hover:text-ink-50"
        >
          All {movie.genre.toLowerCase()} movies
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
      <ul className="rail -mx-5 mt-8 scroll-px-5 px-5 sm:-mx-8 sm:scroll-px-8 sm:px-8">
        {query.data
          ? similar.map((other) => (
              <li key={other.id} className={CELL}>
                <MovieCard movie={other} href={movieHref(other.id)} />
              </li>
            ))
          : Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className={`${CELL} animate-pulse motion-reduce:animate-none`}
              >
                <div className="aspect-[2/3] rounded-2xl bg-white/[0.05]" />
                <div className="mt-3 h-3.5 w-3/4 rounded bg-white/[0.06]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.04]" />
              </li>
            ))}
      </ul>
    </section>
  );
}

// ── Booking bar ──────────────────────────────────────────────────────────────

/** The picked showtime, pinned to the bottom of the screen until the page ends. */
function BookingBar({
  movie,
  show,
  onClear,
}: {
  movie: CatalogMovie;
  show: Showtime;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Your showtime"
      className="sticky bottom-0 z-40 mt-16 animate-fade-up border-t border-white/10 bg-ink-950/85 backdrop-blur-xl motion-reduce:animate-none"
    >
      <div className="container-x flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <PosterArt
            movie={movie}
            showTitle={false}
            className="hidden aspect-[2/3] w-10 shrink-0 rounded-lg ring-1 ring-white/10 sm:block"
          />
          <div className="min-w-0" aria-live="polite">
            <p className="truncate text-sm font-semibold text-ink-50">
              {dayInfo(show.date).label} · {time12(show.time)} ·{' '}
              {theaterShortName(show.theater.name)}, {show.screen.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {show.format} · {show.language} · from {money(show.priceFrom)} per seat ·{' '}
              {show.seats.available} left · up to {MAX_SEATS_PER_BOOKING} seats
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear the selected showtime"
            className="btn-icon h-11 w-11"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
          <Link
            href={`/shows/${encodeURIComponent(show.id)}/seats`}
            className="btn-primary flex-1 sm:flex-none"
          >
            <SeatIcon className="h-4 w-4" />
            Select seats
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

function DetailsSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading movie</span>
      <div aria-hidden="true" className="container-x pb-14 pt-10">
        <div className="h-3 w-40 rounded bg-white/[0.06]" />
        <div className="mt-8 grid items-end gap-8 md:grid-cols-[220px_1fr] lg:grid-cols-[270px_1fr] lg:gap-12">
          <div className="aspect-[2/3] w-40 rounded-3xl bg-white/[0.06] xs:w-48 md:w-full" />
          <div>
            <div className="h-6 w-32 rounded-full bg-white/[0.07]" />
            <div className="mt-5 h-14 w-3/4 rounded-2xl bg-white/[0.07]" />
            <div className="mt-4 h-6 w-1/2 rounded-xl bg-white/[0.05]" />
            <div className="mt-8 h-4 w-full rounded bg-white/[0.05]" />
            <div className="mt-3 h-4 w-5/6 rounded bg-white/[0.05]" />
            <div className="mt-8 flex gap-3">
              <div className="h-12 w-40 rounded-full bg-white/[0.08]" />
              <div className="h-12 w-44 rounded-full bg-white/[0.05]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
