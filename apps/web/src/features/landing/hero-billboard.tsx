'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  StarIcon,
  TicketIcon,
} from '../../components/ui/icons';
import { useWatchlist } from '../../hooks/use-watchlist';
import type { CatalogMovie } from '../catalog/art';
import { cinemaToday, compact, daysBetween, releaseLabel, runtime } from '../catalog/format';
import { movieHref } from '../catalog/links';
import { useMovies } from '../catalog/queries';
import { PosterArt } from '../catalog/poster-art';

const SLIDE_MS = 8000;

function badgeFor(movie: CatalogMovie, index: number): string {
  if (movie.status === 'COMING_SOON') return 'Coming soon';
  if (index === 0) return '#1 this week';
  if (daysBetween(movie.releaseDate, cinemaToday()) <= 3) return 'New release';
  return 'Now showing';
}

/**
 * The billboard: the four most popular titles in cinemas plus the most
 * anticipated upcoming one, straight from the catalog API.
 */
export function HeroBillboard() {
  const showing = useMovies({ status: 'NOW_SHOWING', sort: 'popular', pageSize: 4 });
  const upcoming = useMovies({ status: 'COMING_SOON', sort: 'popular', pageSize: 1 });
  const featured = [...(showing.data?.items ?? []), ...(upcoming.data?.items ?? [])];

  if (featured.length === 0) {
    const failed = showing.isError && upcoming.isError;
    return (
      <HeroPlaceholder
        failed={failed}
        onRetry={() => {
          void showing.refetch();
          void upcoming.refetch();
        }}
      />
    );
  }
  return <Billboard featured={featured} />;
}

/** Same footprint as the billboard, so the page does not jump when data arrives. */
function HeroPlaceholder({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <section
      aria-label="Featured movies"
      aria-busy={!failed}
      className="relative -mt-16 overflow-hidden sm:-mt-[72px]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-brand-900/40 via-ink-950 to-ink-950"
      />
      <div className="container-x relative grid min-h-[640px] items-center gap-10 pb-36 pt-28 sm:min-h-[720px] sm:pt-32 lg:min-h-[780px] lg:grid-cols-[1.25fr_0.75fr] lg:pb-44">
        {failed ? (
          <div className="max-w-xl">
            <p className="section-label">Now showing</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
              We couldn’t load what’s on right now.
            </h1>
            <p className="mt-4 text-ink-300">
              The box office may be restarting. Try again in a moment.
            </p>
            <button type="button" onClick={onRetry} className="btn-primary mt-8">
              Try again
            </button>
          </div>
        ) : (
          <div className="max-w-2xl animate-pulse motion-reduce:animate-none">
            <div className="h-6 w-36 rounded-full bg-white/[0.07]" />
            <div className="mt-6 h-16 w-4/5 rounded-2xl bg-white/[0.07] sm:h-20" />
            <div className="mt-4 h-7 w-2/3 rounded-xl bg-white/[0.05]" />
            <div className="mt-8 h-4 w-full rounded bg-white/[0.05]" />
            <div className="mt-3 h-4 w-5/6 rounded bg-white/[0.05]" />
            <div className="mt-10 flex gap-3">
              <div className="h-12 w-40 rounded-full bg-white/[0.08]" />
              <div className="h-12 w-44 rounded-full bg-white/[0.05]" />
            </div>
          </div>
        )}
        <div aria-hidden="true" className="hidden justify-end lg:flex">
          <div className="aspect-[2/3] w-72 rotate-[2deg] rounded-3xl bg-white/[0.04] xl:w-80" />
        </div>
      </div>
    </section>
  );
}

function Billboard({ featured }: { featured: CatalogMovie[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const { has, toggle } = useWatchlist();
  const movie = featured[Math.min(index, featured.length - 1)];
  const upcoming = movie.status === 'COMING_SOON';

  const go = useCallback(
    (next: number) => setIndex((next + featured.length) % featured.length),
    [],
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Autoplay, except when the visitor is interacting or asked for less motion.
  useEffect(() => {
    if (paused || reducedMotion) return;
    const id = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, reducedMotion, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured movies"
      className="relative -mt-16 overflow-hidden sm:-mt-[72px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Backdrops cross-fade; only the active one runs the slow push-in. The art is
          shifted right so its focal glow sits behind the key art like a halo. */}
      <div aria-hidden="true" className="absolute inset-0">
        {featured.map((item, i) => (
          <div
            key={item.id}
            className={`absolute inset-y-0 left-0 w-full transition-opacity duration-1000 motion-reduce:transition-none lg:left-[14%] ${i === index ? 'opacity-100' : 'opacity-0'}`}
          >
            <PosterArt
              movie={item}
              variant="backdrop"
              showTitle={false}
              className={`h-full w-full blur-[3px] saturate-[1.15] ${i === index ? 'animate-ken-burns motion-reduce:animate-none' : ''}`}
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/75 to-ink-950/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-ink-950/40" />
      </div>

      <div className="container-x relative grid min-h-[640px] items-center gap-10 pb-36 pt-28 sm:min-h-[720px] sm:pt-32 lg:min-h-[780px] lg:grid-cols-[1.25fr_0.75fr] lg:pb-44">
        <div
          key={movie.id}
          className="max-w-2xl animate-fade-up motion-reduce:animate-none"
          aria-live={paused ? 'polite' : 'off'}
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            {badgeFor(movie, index)}
          </p>

          <h1 className="mt-5 text-[2.9rem] font-semibold leading-[0.98] tracking-tight text-white xs:text-6xl sm:text-7xl lg:text-[5.25rem]">
            {movie.title}
          </h1>
          <p className="mt-4 font-display text-xl italic text-ink-200 sm:text-2xl">
            {movie.tagline}
          </p>

          <ul
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-300"
            aria-label="Details"
          >
            {movie.rating !== null ? (
              <li className="flex items-center gap-1.5">
                <StarIcon className="h-4 w-4 text-gold-400" />
                <span className="font-semibold text-white">{movie.rating.toFixed(1)}</span>
                <span className="text-ink-400">({compact(movie.votes)})</span>
              </li>
            ) : (
              <li className="font-semibold text-gold-300">{releaseLabel(movie.releaseDate)}</li>
            )}
            <li className="rounded border border-white/25 px-1.5 text-xs font-bold text-white">
              {movie.certificate}
            </li>
            <li>{runtime(movie.durationMin)}</li>
            <li>{movie.genres.join(', ')}</li>
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

          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-300 line-clamp-3 sm:text-lg">
            {movie.description}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={upcoming ? movieHref(movie.id) : `${movieHref(movie.id)}#showtimes`}
              className="btn-primary px-6 py-3.5 text-[15px]"
            >
              <TicketIcon className="h-5 w-5" />
              {upcoming ? 'Release details' : 'Get tickets'}
            </Link>
            <button
              type="button"
              onClick={() => toggle(movie.id)}
              aria-pressed={has(movie.id)}
              className="btn-ghost border-white/15 bg-white/[0.06] px-5 py-3.5 text-[15px] backdrop-blur hover:bg-white/[0.1]"
            >
              <HeartIcon
                filled={has(movie.id)}
                className={`h-5 w-5 ${has(movie.id) ? 'text-brand-400' : ''}`}
              />
              {has(movie.id) ? 'On your watchlist' : 'Add to watchlist'}
            </button>
          </div>
        </div>

        {/* The key art itself, floating on the right on wide screens. */}
        <div className="relative hidden justify-end lg:flex">
          <div key={movie.id} className="w-72 animate-fade-up motion-reduce:animate-none xl:w-80">
            <PosterArt
              movie={movie}
              credit
              className="aspect-[2/3] w-full rotate-[2deg] rounded-3xl text-lg shadow-lift ring-1 ring-white/15"
            />
          </div>
        </div>
      </div>

      {/* Slide picker: thumbnails with a progress bar on wide screens, dots on small ones. */}
      <div className="container-x absolute inset-x-0 bottom-24 flex items-center justify-between gap-4 sm:bottom-28 lg:bottom-32">
        <div className="flex items-center gap-2" role="group" aria-label="Choose a featured movie">
          {featured.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${item.title}`}
              aria-current={i === index ? 'true' : undefined}
              className={`group relative overflow-hidden rounded-full transition-all duration-300 motion-reduce:transition-none ${
                i === index ? 'h-1.5 w-12 bg-white/25' : 'h-1.5 w-6 bg-white/20 hover:bg-white/40'
              }`}
            >
              {i === index ? (
                <span
                  key={`${index}-${paused || reducedMotion}`}
                  className="absolute inset-0 origin-left rounded-full bg-white"
                  style={
                    paused || reducedMotion
                      ? undefined
                      : { animation: `progress ${SLIDE_MS}ms linear both` }
                  }
                />
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous featured movie"
            className="btn-icon border-white/15 bg-ink-950/40 backdrop-blur"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next featured movie"
            className="btn-icon border-white/15 bg-ink-950/40 backdrop-blur"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
