'use client';

import Link from 'next/link';
import type { AdminShow, AdminShowSort, SortOrder } from '@cineseat/shared';
import {
  CalendarIcon,
  ExternalLinkIcon,
  EyeIcon,
  MoreIcon,
  PencilIcon,
  TrashIcon,
} from '../../../components/ui/icons';
import { Menu, type MenuItem } from '../../../components/ui/menu';
import { money } from '../../catalog/format';
import { adminShowHref, adminShowsHref } from '../links';
import { OccupancyBar, PosterThumb, Tag } from '../ui/bits';
import { clock12, plural, weekdayDate } from '../ui/format';
import { Checkbox, SortHeader } from '../ui/list-kit';
import { AvailabilityBadge, StateBadge, lockReason } from './bits';

export type ShowRowHandlers = {
  onEdit: (show: AdminShow) => void;
  onCancel: (show: AdminShow) => void;
};

type Props = ShowRowHandlers & {
  shows: AdminShow[];
  sort: AdminShowSort;
  order: SortOrder;
  onSort: (sort: AdminShowSort) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
  stale: boolean;
};

/**
 * The showtimes list: a table on wide screens, cards below `xl`. The whole row
 * opens the show; the checkbox and "⋯" sit above that link.
 */
export function ShowsTable(props: Props) {
  const { shows, selected, onToggleAll, stale } = props;
  const all = shows.length > 0 && shows.every((show) => selected.has(show.id));
  const some = !all && shows.some((show) => selected.has(show.id));
  return (
    <div
      className={`transition-opacity motion-reduce:transition-none ${stale ? 'opacity-60' : ''}`}
    >
      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">Showtimes</caption>
          <thead className="border-b border-white/[0.07] bg-white/[0.02] text-xs text-ink-400">
            <tr>
              <th scope="col" className="w-12 py-3 pl-4">
                <Checkbox
                  checked={all}
                  indeterminate={some}
                  onChange={onToggleAll}
                  label={all ? 'Unselect all shows on this page' : 'Select all shows on this page'}
                />
              </th>
              <SortHeader {...props} column="startsAt" className="w-32">
                When
              </SortHeader>
              <SortHeader {...props} column="movie" className="w-[22%]">
                Movie
              </SortHeader>
              <SortHeader {...props} column="theater">
                Where
              </SortHeader>
              <SortHeader {...props} column="occupancy" className="w-40">
                Seats
              </SortHeader>
              <SortHeader {...props} column="revenue" className="w-28" align="right">
                Revenue
              </SortHeader>
              <SortHeader {...props} column="price" className="w-24" align="right">
                Price
              </SortHeader>
              <th scope="col" className="w-14 py-3 pr-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {shows.map((show) => {
              const checked = selected.has(show.id);
              return (
                <tr
                  key={show.id}
                  className={`relative transition-colors motion-reduce:transition-none ${
                    checked ? 'bg-brand-500/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <td className="relative z-10 py-3 pl-4">
                    <Checkbox
                      checked={checked}
                      onChange={() => props.onToggle(show.id)}
                      label={`Select ${show.movie.title} at ${clock12(show.time)} on ${weekdayDate(show.date)}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={adminShowHref(show.id)}
                      className="block font-semibold tabular-nums text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                    >
                      {clock12(show.time)}
                    </Link>
                    <p className="text-xs text-ink-400">{weekdayDate(show.date)}</p>
                    {show.state !== 'UPCOMING' ? (
                      <div className="mt-1">
                        <StateBadge state={show.state} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <PosterThumb movie={show.movie} className="w-9" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-100">{show.movie.title}</p>
                        <p className="mt-1 flex gap-1">
                          <Tag>{show.format}</Tag>
                          <Tag>{show.language}</Tag>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="truncate text-ink-100">{show.theater.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      {show.screen.name} · {show.theater.city}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <OccupancyBar
                      sold={show.seats.sold}
                      held={show.seats.held}
                      capacity={show.seats.total}
                    />
                    {show.seats.held ? (
                      <p className="mt-1 text-[11px] text-gold-300">{show.seats.held} on hold</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-semibold tabular-nums text-ink-50">{money(show.revenue)}</p>
                    <p className="text-xs text-ink-400">{plural(show.bookings, 'booking')}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-200">
                    {money(show.basePrice)}
                  </td>
                  <td className="relative z-10 py-3 pr-4 text-right">
                    <ShowMenu show={show} {...props} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="grid grid-cols-1 gap-3 xl:hidden">
        {shows.map((show) => {
          const checked = selected.has(show.id);
          return (
            <li
              key={show.id}
              className={`relative flex gap-3 rounded-2xl border p-3 transition-colors motion-reduce:transition-none sm:p-4 ${
                checked
                  ? 'border-brand-500/40 bg-brand-500/[0.06]'
                  : 'border-white/[0.07] bg-white/[0.025] hover:border-white/15'
              }`}
            >
              <div className="relative z-10 pt-0.5">
                <Checkbox
                  checked={checked}
                  onChange={() => props.onToggle(show.id)}
                  label={`Select ${show.movie.title} at ${clock12(show.time)} on ${weekdayDate(show.date)}`}
                />
              </div>
              <PosterThumb movie={show.movie} className="w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={adminShowHref(show.id)}
                      className="font-semibold tabular-nums text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                    >
                      {weekdayDate(show.date)} · {clock12(show.time)}
                    </Link>
                    <p className="truncate text-sm text-ink-200">{show.movie.title}</p>
                    <p className="truncate text-xs text-ink-400">
                      {show.theater.name} · {show.screen.name}
                    </p>
                  </div>
                  <div className="relative z-10 -mr-1 -mt-1">
                    <ShowMenu show={show} {...props} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {show.state !== 'UPCOMING' ? <StateBadge state={show.state} /> : null}
                  <AvailabilityBadge availability={show.availability} />
                  <Tag>{show.format}</Tag>
                  <Tag>{show.language}</Tag>
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-t border-white/[0.06] pt-3">
                  <OccupancyBar
                    sold={show.seats.sold}
                    held={show.seats.held}
                    capacity={show.seats.total}
                  />
                  <p className="text-right text-sm font-semibold tabular-nums text-ink-50">
                    {money(show.revenue)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ShowMenu({ show, onEdit, onCancel }: ShowRowHandlers & { show: AdminShow }) {
  const locked = lockReason(show);
  const hasTickets = show.seats.sold > 0 || show.seats.held > 0;
  const items: MenuItem[] = [
    { label: 'Open', icon: EyeIcon, href: adminShowHref(show.id) },
    {
      label: 'Change…',
      icon: PencilIcon,
      onSelect: () => onEdit(show),
      disabled: locked !== null,
      hint: locked ?? undefined,
    },
    {
      label: 'This movie’s showtimes',
      icon: CalendarIcon,
      href: adminShowsHref({ movie: show.movie.id }),
    },
    {
      label: 'Seat page on the site',
      icon: ExternalLinkIcon,
      href: `/shows/${encodeURIComponent(show.id)}/seats`,
      external: true,
    },
    'separator',
    {
      label: 'Cancel show…',
      icon: TrashIcon,
      danger: true,
      onSelect: () => onCancel(show),
      disabled: hasTickets,
      hint: hasTickets ? 'Seats are sold or held' : undefined,
    },
  ];
  return (
    <Menu label={`Actions for ${show.movie.title} at ${clock12(show.time)}`} items={items}>
      <MoreIcon className="h-4 w-4" />
    </Menu>
  );
}
