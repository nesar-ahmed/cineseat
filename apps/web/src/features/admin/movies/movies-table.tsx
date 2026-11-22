'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { AdminMovie, AdminMovieSort, SortOrder } from '@cineseat/shared';
import { Menu, type MenuItem } from '../../../components/ui/menu';
import {
  EyeIcon,
  ExternalLinkIcon,
  MoreIcon,
  PencilIcon,
  RefreshIcon,
  StarIcon,
  TrashIcon,
} from '../../../components/ui/icons';
import { movieHref } from '../../catalog/links';
import { money, runtime } from '../../catalog/format';
import { relativeTime, exactTime } from '../../notifications/time';
import { adminMovieEditHref, adminMovieHref } from '../links';
import { count } from '../dashboard/format';
import { PosterThumb, Tag, Updating } from '../ui/bits';
import { plural, shortDate, showLabel, sortedFormats } from '../ui/format';
import { Checkbox, SortHeader } from '../ui/list-kit';
import { STATUS_LABEL, StatusBadge, otherStatus } from './bits';

export type RowHandlers = {
  onSwitchStatus: (movie: AdminMovie) => void;
  onDelete: (movie: AdminMovie) => void;
  /** Movie whose status is changing (its row shows it). */
  pendingId?: string;
};

type Props = RowHandlers & {
  movies: AdminMovie[];
  sort: AdminMovieSort;
  order: SortOrder;
  onSort: (sort: AdminMovieSort) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
  /** "Now" after hydration, for relative times; null on the server. */
  now: number | null;
  /** Dimmed while the next page of results loads. */
  stale: boolean;
};

/**
 * The movies list: a table on wide screens, cards below `xl`. The whole row
 * opens the movie (a stretched link on the title); the checkbox and the "⋯"
 * menu sit above that link. Sortable columns are buttons in their headers and
 * announce their state with `aria-sort`.
 */
export function MoviesTable(props: Props) {
  const { movies, selected, onToggleAll, stale } = props;
  const all = movies.length > 0 && movies.every((movie) => selected.has(movie.id));
  const some = !all && movies.some((movie) => selected.has(movie.id));

  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${stale ? 'opacity-60' : ''}`}
    >
      {/* Wide screens: a table. */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Movies</caption>
          <thead className="border-b border-white/[0.07] bg-white/[0.02] text-xs text-ink-400">
            <tr>
              <th scope="col" className="w-12 py-3 pl-4">
                <Checkbox
                  checked={all}
                  indeterminate={some}
                  onChange={(value) => onToggleAll(value)}
                  label={
                    all ? 'Unselect all movies on this page' : 'Select all movies on this page'
                  }
                />
              </th>
              <SortHeader {...props} column="title" className="w-[34%]">
                Movie
              </SortHeader>
              <th scope="col" className="w-36 px-3 py-3 font-medium">
                Status
              </th>
              <SortHeader {...props} column="release" className="w-32">
                Release
              </SortHeader>
              <SortHeader {...props} column="shows" className="w-44">
                Upcoming shows
              </SortHeader>
              <SortHeader {...props} column="tickets" className="w-28" align="right">
                Tickets
              </SortHeader>
              <SortHeader {...props} column="revenue" className="w-32" align="right">
                Revenue
              </SortHeader>
              <SortHeader {...props} column="rating" className="hidden w-36 2xl:table-cell">
                Audience
              </SortHeader>
              <SortHeader {...props} column="updated" className="hidden w-36 2xl:table-cell">
                Updated
              </SortHeader>
              <th scope="col" className="w-14 py-3 pr-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {movies.map((movie) => (
              <TableRow key={movie.id} movie={movie} {...props} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Below xl: cards. */}
      <ul className="grid grid-cols-1 gap-3 xl:hidden">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} {...props} />
        ))}
      </ul>
    </div>
  );
}

function TableRow({ movie, ...props }: Props & { movie: AdminMovie }) {
  const checked = props.selected.has(movie.id);
  const pending = props.pendingId === movie.id;
  return (
    <tr
      className={`group relative transition-colors motion-reduce:transition-none ${
        checked ? 'bg-brand-500/[0.06]' : 'hover:bg-white/[0.03]'
      }`}
    >
      <td className="relative z-10 py-3 pl-4 align-middle">
        <Checkbox
          checked={checked}
          onChange={() => props.onToggle(movie.id)}
          label={`Select “${movie.title}”`}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <PosterThumb movie={movie} className="w-10" />
          <div className="min-w-0">
            <Link
              href={adminMovieHref(movie.id)}
              className="block truncate font-semibold text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
            >
              {movie.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {movie.genres.join(', ')} · {movie.language} · {runtime(movie.durationMin)}
            </p>
            <p className="mt-1 flex gap-1">
              <Tag title="Certificate">{movie.certificate}</Tag>
              {sortedFormats(movie.formats).map((format) => (
                <Tag key={format}>{format}</Tag>
              ))}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {pending ? <Updating /> : <StatusBadge status={movie.status} />}
      </td>
      <td className="px-3 py-3 tabular-nums text-ink-200">{shortDate(movie.releaseDate)}</td>
      <td className="px-3 py-3">
        <UpcomingShows movie={movie} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-ink-100">
        {count(movie.stats.ticketsSold)}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-50">
        {money(movie.stats.revenue)}
      </td>
      <td className="hidden px-3 py-3 2xl:table-cell">
        <Audience movie={movie} />
      </td>
      <td className="hidden px-3 py-3 text-xs text-ink-400 2xl:table-cell">
        <Updated iso={movie.updatedAt} now={props.now} />
      </td>
      <td className="relative z-10 py-3 pr-4 text-right">
        <RowMenu movie={movie} {...props} />
      </td>
    </tr>
  );
}

function MovieCard({ movie, ...props }: Props & { movie: AdminMovie }) {
  const checked = props.selected.has(movie.id);
  const pending = props.pendingId === movie.id;
  return (
    <li
      className={`relative flex gap-3 rounded-2xl border p-3 transition-colors motion-reduce:transition-none sm:p-4 ${
        checked
          ? 'border-brand-500/40 bg-brand-500/[0.06]'
          : 'border-white/[0.07] bg-white/[0.025] hover:border-white/15'
      }`}
    >
      <div className="relative z-10 pt-0.5">
        <Checkbox
          checked={checked}
          onChange={() => props.onToggle(movie.id)}
          label={`Select “${movie.title}”`}
        />
      </div>
      <PosterThumb movie={movie} className="w-14 sm:w-16" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={adminMovieHref(movie.id)}
              className="line-clamp-2 font-semibold text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
            >
              {movie.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {movie.genres.join(', ')} · {movie.language} · {runtime(movie.durationMin)}
            </p>
          </div>
          <div className="relative z-10 -mr-1 -mt-1">
            <RowMenu movie={movie} {...props} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pending ? <Updating /> : <StatusBadge status={movie.status} />}
          <Tag>{movie.certificate}</Tag>
          {sortedFormats(movie.formats).map((format) => (
            <Tag key={format}>{format}</Tag>
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-xs">
          <Stat label="Release">{shortDate(movie.releaseDate)}</Stat>
          <Stat label="Upcoming">
            {movie.stats.upcomingShows ? plural(movie.stats.upcomingShows, 'show') : 'None'}
          </Stat>
          <Stat label="Revenue">{money(movie.stats.revenue)}</Stat>
        </dl>
      </div>
    </li>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="truncate font-semibold tabular-nums text-ink-100">{children}</dd>
    </div>
  );
}

function UpcomingShows({ movie }: { movie: AdminMovie }) {
  const { upcomingShows, nextShowAt } = movie.stats;
  if (!upcomingShows || !nextShowAt) {
    return (
      <span className="text-xs text-ink-500">
        {movie.status === 'COMING_SOON' ? 'Not scheduled yet' : 'None scheduled'}
      </span>
    );
  }
  return (
    <div className="min-w-0">
      <p className="font-semibold tabular-nums text-ink-100">{plural(upcomingShows, 'show')}</p>
      <p className="truncate text-xs text-ink-400">Next {showLabel(nextShowAt)}</p>
    </div>
  );
}

function Audience({ movie }: { movie: AdminMovie }) {
  if (movie.rating !== null) {
    return (
      <span className="inline-flex items-center gap-1 tabular-nums text-ink-100">
        <StarIcon className="h-3.5 w-3.5 text-gold-400" />
        {movie.rating.toFixed(1)}
        <span className="text-xs text-ink-500">({count(movie.votes)})</span>
      </span>
    );
  }
  return (
    <span className="text-xs tabular-nums text-ink-400">
      {movie.interested ? `${count(movie.interested)} interested` : 'No ratings yet'}
    </span>
  );
}

function Updated({ iso, now }: { iso: string; now: number | null }) {
  return (
    <time dateTime={iso} title={exactTime(iso)}>
      {now ? relativeTime(iso, now) : shortDate(iso.slice(0, 10))}
    </time>
  );
}

export function RowMenu({ movie, onSwitchStatus, onDelete }: RowHandlers & { movie: AdminMovie }) {
  const to = otherStatus(movie.status);
  const items: MenuItem[] = [
    { label: 'Open', icon: EyeIcon, href: adminMovieHref(movie.id) },
    { label: 'Edit', icon: PencilIcon, href: adminMovieEditHref(movie.id) },
    {
      label: `Move to ${STATUS_LABEL[to]}`,
      icon: RefreshIcon,
      onSelect: () => onSwitchStatus(movie),
      hint:
        to === 'COMING_SOON' && movie.stats.upcomingShows
          ? `Its ${plural(movie.stats.upcomingShows, 'upcoming show')} stay on sale`
          : undefined,
    },
    { label: 'View on site', icon: ExternalLinkIcon, href: movieHref(movie.id), external: true },
    'separator',
    {
      label: 'Delete…',
      icon: TrashIcon,
      danger: true,
      onSelect: () => onDelete(movie),
      disabled: movie.stats.shows > 0,
      hint:
        movie.stats.shows > 0 ? `Has ${plural(movie.stats.shows, 'show')} on record` : undefined,
    },
  ];
  return (
    <Menu label={`Actions for “${movie.title}”`} items={items}>
      <MoreIcon className="h-4 w-4" />
    </Menu>
  );
}
