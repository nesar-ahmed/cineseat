import type { ReactNode } from 'react';
import type { Movie } from '@cineseat/shared';
import { RefreshIcon } from '../../../components/ui/icons';
import { withArt } from '../../catalog/art';
import { PosterArt } from '../../catalog/poster-art';
import { percent } from './format';

/** Small visual pieces the admin modules share, so a tag or a bar reads the same everywhere. */

/** A small tag: certificate, format, language, amenity. */
export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-md border border-white/10 px-1.5 py-px text-[11px] font-semibold tracking-wide text-ink-300"
    >
      {children}
    </span>
  );
}

export type BadgeTone = 'green' | 'blue' | 'gold' | 'rose' | 'gray';

const TONE: Record<BadgeTone, { box: string; dot: string }> = {
  green: { box: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25', dot: 'bg-emerald-400' },
  blue: { box: 'bg-sky-400/10 text-sky-300 ring-sky-400/25', dot: 'bg-sky-400' },
  gold: { box: 'bg-gold-400/10 text-gold-300 ring-gold-400/25', dot: 'bg-gold-400' },
  rose: { box: 'bg-brand-500/10 text-brand-300 ring-brand-500/30', dot: 'bg-brand-400' },
  gray: { box: 'bg-white/[0.05] text-ink-300 ring-white/10', dot: 'bg-ink-400' },
};

/** A status as a coloured pill with a dot (the dot repeats the colour for a glance). */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE[tone].box}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  );
}

/**
 * The poster (or, without one, the same generated art the site shows), at the
 * 2:3 ratio; the caller sets the width.
 */
export function PosterThumb({
  movie,
  className = 'w-10',
}: {
  movie: Pick<Movie, 'id' | 'title' | 'genre' | 'posterPath'> & { director?: string | null };
  className?: string;
}) {
  return (
    <PosterArt
      movie={withArt({ director: null, ...movie } as Movie)}
      showTitle={false}
      className={`aspect-[2/3] shrink-0 self-start rounded-md ring-1 ring-white/10 ${className}`}
    />
  );
}

/**
 * Sold (and held) over capacity as a thin bar, with the numbers above it.
 * Green while filling, gold from `warnAt`, rose when full.
 */
export function OccupancyBar({
  sold,
  held = 0,
  capacity,
  label,
  warnAt = 0.9,
}: {
  sold: number;
  held?: number;
  capacity: number;
  /** Left of the numbers, e.g. "61/80"; defaults to sold/capacity. */
  label?: ReactNode;
  warnAt?: number;
}) {
  const full = capacity > 0 && sold >= capacity;
  const warm = !full && capacity > 0 && (sold + held) / capacity >= warnAt;
  const whole = Math.max(1, capacity);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums text-ink-200">
          {label ?? `${sold.toLocaleString('en-US')}/${capacity.toLocaleString('en-US')}`}
        </span>
        {full ? (
          <span className="font-semibold text-brand-300">Sold out</span>
        ) : warm ? (
          <span className="font-semibold text-gold-300">Almost full</span>
        ) : (
          <span className="text-ink-500">{percent(sold, capacity)}%</span>
        )}
      </div>
      <div
        role="img"
        aria-label={`${sold} of ${capacity} seats sold${held ? `, ${held} held` : ''}`}
        className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
      >
        <span
          style={{ width: `${(sold / whole) * 100}%` }}
          className={full ? 'bg-brand-500' : 'bg-emerald-400/80'}
        />
        <span style={{ width: `${(held / whole) * 100}%` }} className="bg-gold-400" />
      </div>
    </div>
  );
}

/** In place of a status while a change to it is being saved. */
export function Updating() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
      <RefreshIcon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
      Updating…
    </span>
  );
}
