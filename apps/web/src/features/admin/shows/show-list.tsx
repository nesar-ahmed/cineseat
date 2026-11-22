import Link from 'next/link';
import type { AdminShow } from '@cineseat/shared';
import { adminShowHref } from '../links';
import { OccupancyBar, PosterThumb, Tag } from '../ui/bits';
import { showLabel } from '../ui/format';

/**
 * A short list of shows (a cinema's next shows, a screen's, …): when, what,
 * where and how full — each line opens the show. `venue` decides what the
 * middle column says: the cinema and screen, or just the screen (on a cinema's page).
 */
export function ShowList({
  shows,
  venue = 'theater',
  empty,
}: {
  shows: AdminShow[];
  venue?: 'theater' | 'screen';
  empty: string;
}) {
  if (shows.length === 0) return <p className="px-5 pb-6 text-sm text-ink-400 sm:px-6">{empty}</p>;
  return (
    <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
      {shows.map((show) => (
        <li key={show.id}>
          <Link
            href={adminShowHref(show.id)}
            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:gap-4 sm:px-6"
          >
            <PosterThumb movie={show.movie} className="w-8" />
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
              <div className="min-w-0 sm:w-44 sm:shrink-0">
                <p className="text-sm font-semibold tabular-nums text-ink-50">
                  {showLabel(show.startsAt)}
                </p>
                <p className="truncate text-xs text-ink-400">{show.movie.title}</p>
              </div>
              <div className="mt-0.5 min-w-0 sm:mt-0 sm:flex-1">
                <p className="flex items-center gap-1.5 truncate text-xs text-ink-300 sm:text-sm sm:text-ink-100">
                  <span className="truncate">
                    {venue === 'theater' ? show.theater.name : show.screen.name}
                  </span>
                  <Tag>{show.format}</Tag>
                </p>
                <p className="hidden truncate text-xs text-ink-400 sm:block">
                  {venue === 'theater'
                    ? `${show.screen.name} · ${show.theater.city}`
                    : show.language}
                </p>
              </div>
            </div>
            <div className="w-24 shrink-0 sm:w-36">
              <OccupancyBar
                sold={show.seats.sold}
                held={show.seats.held}
                capacity={show.seats.total}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
