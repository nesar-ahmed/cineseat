'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeartIcon, StarIcon } from '../../components/ui/icons';
import { useWatchlist } from '../../hooks/use-watchlist';
import type { CatalogMovie } from './art';
import { compact, releaseLabel, runtime } from './format';
import { PosterArt } from './poster-art';

type Props = {
  movie: CatalogMovie;
  /** Where the card leads — the movie's page (see `movieHref`). */
  href: string;
  /** Cards in a rail get a fixed width; cards in a grid fill their column. */
  className?: string;
  /** Extra line under the meta, e.g. the next showtime. */
  footer?: ReactNode;
};

export function MovieCard({ movie, href, className = '', footer }: Props) {
  const { has, toggle } = useWatchlist();
  const saved = has(movie.id);
  const upcoming = movie.status === 'COMING_SOON';

  return (
    <article className={`group relative ${className}`}>
      <Link href={href} className="block rounded-2xl focus-visible:outline-offset-4">
        <div className="relative overflow-hidden rounded-2xl bg-ink-900 shadow-card ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-white/15 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
          <PosterArt
            movie={movie}
            className="aspect-[2/3] w-full text-[13px] transition duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:text-sm"
          />

          <div className="pointer-events-none absolute left-2.5 top-2.5 flex gap-1.5">
            <span className="rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-100 ring-1 ring-white/15 backdrop-blur">
              {movie.certificate}
            </span>
            {movie.formats.includes('3D') ? (
              <span className="rounded-md bg-gold-400/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-950">
                3D
              </span>
            ) : null}
          </div>

          {upcoming ? (
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/80 to-transparent px-3 pb-2.5 pt-8 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-300">
              {releaseLabel(movie.releaseDate)}
            </p>
          ) : (
            <span className="absolute inset-x-3 bottom-3 translate-y-2 rounded-full bg-brand-500 py-2 text-center text-xs font-semibold text-white opacity-0 shadow-glow transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
              Book tickets
            </span>
          )}
        </div>

        <div className="mt-3 px-0.5">
          <h3 className="truncate font-sans text-[15px] font-semibold text-ink-50">
            {movie.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-400">
            {movie.genres.slice(0, 2).join(' · ')} · {runtime(movie.durationMin)} · {movie.language}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs">
            {movie.rating !== null ? (
              <>
                <StarIcon className="h-3.5 w-3.5 text-gold-400" />
                <span className="font-semibold text-ink-100">{movie.rating.toFixed(1)}</span>
                <span className="text-ink-400">{compact(movie.votes)} ratings</span>
              </>
            ) : (
              <>
                <HeartIcon filled className="h-3.5 w-3.5 text-brand-400" />
                <span className="font-semibold text-ink-100">{compact(movie.interested)}</span>
                <span className="text-ink-400">interested</span>
              </>
            )}
          </p>
          {footer}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggle(movie.id)}
        aria-pressed={saved}
        aria-label={
          saved
            ? `Remove ${movie.title} from your watchlist`
            : `Save ${movie.title} to your watchlist`
        }
        className={`absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 backdrop-blur transition duration-200 motion-reduce:transition-none ${
          saved
            ? 'bg-brand-500 text-white ring-brand-400'
            : 'bg-ink-950/60 text-ink-100 ring-white/15 hover:bg-ink-950/85'
        }`}
      >
        <HeartIcon filled={saved} className="h-4 w-4" />
      </button>
    </article>
  );
}
