'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AdminTheaterSort,
  ShowFormat,
  defaultTheaterSortOrder,
  type AdminTheater,
} from '@cineseat/shared';
import {
  BuildingIcon,
  CalendarIcon,
  EyeIcon,
  MapPinIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../../components/ui/icons';
import { Menu } from '../../../components/ui/menu';
import { useAuth } from '../../auth/auth-provider';
import { money } from '../../catalog/format';
import { adminScheduleHref, adminShowsHref, adminTheaterHref } from '../links';
import { OccupancyBar, Tag } from '../ui/bits';
import { Choice, FilterDrawer, FilterGroup, TogglePills, toggleIn } from '../ui/filter-kit';
import { plural, showLabel } from '../ui/format';
import {
  EmptyResults,
  FilterChips,
  FiltersButton,
  ListError,
  ListFooter,
  ListSkeleton,
  RefreshButton,
  SearchBox,
  SortControl,
  TabPills,
  usePageClamp,
  type FilterChip,
} from '../ui/list-kit';
import { PageHeader } from '../ui/page-kit';
import { useUrlQuery } from '../use-url-query';
import {
  COMMON_AMENITIES,
  NO_FILTERS,
  SORT_LABEL,
  activeFilterCount,
  effectiveOrder,
  orderLabel,
  parseQuery,
  toApiParams,
  toSearchParams,
  type FilterPatch,
  type TheatersQuery,
} from './list-query';
import { useAdminTheaters, useAllTheaters } from './queries';
import { DeleteTheaterDialog } from './theater-actions';
import { TheaterDialog } from './theater-dialog';

const SORTS = AdminTheaterSort.options.map((value) => ({ value, label: SORT_LABEL[value] }));

/**
 * `/admin/theaters`: every cinema as a card — its screens, what is on today,
 * how full the coming schedule is and what it has earned — with city tabs,
 * search, filters and sorting, the whole view in the URL. A card opens the
 * cinema; "⋯" has the quick actions. Cinemas are added in a dialog.
 */
export function AdminTheatersPage() {
  const { user } = useAuth();
  const { query, setQuery, hrefWith } = useUrlQuery(parseQuery, toSearchParams);
  const params = useMemo(() => toApiParams(query), [query]);
  const list = useAdminTheaters(user?.id, params);
  const all = useAllTheaters(user?.id);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminTheater | null>(null);
  const [deleting, setDeleting] = useState<AdminTheater | null>(null);

  const update = useCallback(
    (patch: Partial<TheatersQuery>) => setQuery({ page: 1, ...patch }),
    [setQuery],
  );
  const goTo = useCallback((page: number) => setQuery({ page }), [setQuery]);
  const data = list.data;
  usePageClamp(data, list.isPlaceholderData, query.page, goTo);

  const items = data?.items ?? [];
  const filters = activeFilterCount(query);
  const filtered = filters > 0 || query.q.trim() !== '' || query.city !== null;
  const amenities = useMemo(
    () => [
      ...new Set([
        ...(all.data?.items ?? []).flatMap((theater) => theater.amenities),
        ...COMMON_AMENITIES,
      ]),
    ],
    [all.data],
  );
  const screens = items.reduce((sum, theater) => sum + theater.screens.length, 0);

  const cityTabs = [
    { id: '', label: 'All cities', count: data?.counts.all },
    ...(data?.counts.cities ?? []).map((city) => ({
      id: city.city,
      label: city.city,
      count: city.count,
    })),
  ];
  // A city from a link that has no cinemas (any more) still gets its tab.
  if (query.city && !cityTabs.some((tab) => tab.id.toLowerCase() === query.city!.toLowerCase()))
    cityTabs.push({ id: query.city, label: query.city, count: 0 });

  return (
    <div className="flex flex-col gap-6 pb-16">
      <PageHeader
        eyebrow="Catalog"
        title="Theaters"
        description={
          data
            ? `${plural(data.counts.all, 'cinema')} in ${plural(data.counts.cities.length, 'city', 'cities')}${
                filtered ? '' : ` · ${plural(screens, 'screen')}`
              } · sales and occupancy of the coming schedule.`
            : 'Every cinema with its screens, schedule and sales.'
        }
        actions={
          <>
            <RefreshButton
              onClick={() => void list.refetch()}
              busy={list.isFetching}
              label="Refresh the list"
            />
            <button type="button" onClick={() => setAdding(true)} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              Add theater
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <TabPills
          label="City"
          value={
            cityTabs.find((tab) => tab.id.toLowerCase() === (query.city ?? '').toLowerCase())?.id ??
            ''
          }
          onChange={(city) => update({ city: city || null })}
          tabs={cityTabs}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q })}
            label="Search theaters"
            placeholder="Search name, city, address, amenity, screen or id"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltersButton count={filters} onClick={() => setFiltersOpen(true)} />
            <SortControl
              id="theaters-sort"
              sorts={SORTS}
              sort={query.sort}
              order={effectiveOrder(query)}
              naturalOrder={defaultTheaterSortOrder}
              orderLabel={orderLabel}
              onChange={update}
            />
          </div>
        </div>
        <FilterChips chips={chipsFor(query, update)} onClearAll={() => update(NO_FILTERS)} />
      </div>

      {list.isPending ? (
        <ListSkeleton label="Loading theaters" rows={4} height="h-56" />
      ) : list.isError && !data ? (
        <ListError
          what="theaters"
          message={list.error.message}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyResults
          icon={BuildingIcon}
          filtered={filtered}
          onClear={() => update({ ...NO_FILTERS, q: '', city: null })}
          emptyTitle="No theaters yet"
          emptyText="Add the first cinema, then its screens; shows are scheduled on screens."
          action={
            <button type="button" onClick={() => setAdding(true)} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              Add theater
            </button>
          }
        />
      ) : (
        <section aria-label="Results">
          <ul
            className={`grid grid-cols-1 gap-4 transition-opacity motion-reduce:transition-none xl:grid-cols-2 ${
              list.isPlaceholderData ? 'opacity-60' : ''
            }`}
          >
            {items.map((theater) => (
              <TheaterCard
                key={theater.id}
                theater={theater}
                onEdit={() => setEditing(theater)}
                onDelete={() => setDeleting(theater)}
              />
            ))}
          </ul>
          <ListFooter
            page={data!.page}
            pageSize={data!.pageSize}
            shown={items.length}
            total={data!.total}
            onPageSize={(size) => update({ size })}
            hrefFor={(page) => hrefWith({ page })}
          />
        </section>
      )}

      <FilterDrawer<FilterPatch>
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter theaters"
        value={query}
        empty={NO_FILTERS}
        onApply={update}
      >
        {(draft, set) => (
          <>
            <FilterGroup label="Schedule">
              <Choice
                options={[
                  ['', 'Any'],
                  ['scheduled', 'Has upcoming shows'],
                  ['unscheduled', 'No upcoming shows'],
                ]}
                value={draft.schedule ?? ''}
                onChange={(schedule) =>
                  set({ schedule: (schedule || null) as FilterPatch['schedule'] })
                }
              />
            </FilterGroup>
            <FilterGroup label="Screens can show" hint="At least one screen">
              <TogglePills
                options={ShowFormat.options}
                chosen={draft.formats}
                onToggle={(format) =>
                  set({ formats: toggleIn(draft.formats, format as ShowFormat) })
                }
              />
            </FilterGroup>
            <FilterGroup label="Amenities" hint="Any of these">
              <TogglePills
                options={amenities}
                chosen={draft.amenities}
                onToggle={(amenity) => set({ amenities: toggleIn(draft.amenities, amenity) })}
              />
            </FilterGroup>
          </>
        )}
      </FilterDrawer>

      <TheaterDialog
        open={adding}
        onClose={() => setAdding(false)}
        amenitySuggestions={amenities}
      />
      <TheaterDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        theater={editing ?? undefined}
        amenitySuggestions={amenities}
      />
      <DeleteTheaterDialog
        theater={
          deleting
            ? {
                id: deleting.id,
                name: deleting.name,
                blockedReason: deleting.stats.shows
                  ? `${deleting.name} has ${plural(deleting.stats.shows, 'show')}. Shows carry bookings and sales, so a theater with shows can’t be deleted.`
                  : null,
              }
            : null
        }
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/**
 * One cinema: name and place, amenities, its screens, and four numbers — what
 * is on today, what is coming, how full that is, and what it has earned.
 */
function TheaterCard({
  theater,
  onEdit,
  onDelete,
}: {
  theater: AdminTheater;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { stats } = theater;
  return (
    <li className="relative flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-inset transition-colors hover:border-white/15 motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-200 ring-1 ring-brand-500/25">
          <BuildingIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={adminTheaterHref(theater.id)}
            className="block truncate font-display text-xl text-ink-50 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {theater.name}
          </Link>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-400">
            <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {theater.city} · {theater.address}
            </span>
          </p>
        </div>
        <div className="relative z-10 -mr-1 -mt-1">
          <Menu
            label={`Actions for ${theater.name}`}
            items={[
              { label: 'Open', icon: EyeIcon, href: adminTheaterHref(theater.id) },
              { label: 'Edit details', icon: PencilIcon, onSelect: onEdit },
              {
                label: 'Showtimes',
                icon: CalendarIcon,
                href: adminShowsHref({ theater: theater.id }),
              },
              {
                label: 'Schedule shows',
                icon: PlusIcon,
                href: adminScheduleHref({ theater: theater.id }),
                disabled: theater.screens.length === 0,
                hint: theater.screens.length === 0 ? 'Add a screen first' : undefined,
              },
              'separator',
              {
                label: 'Delete…',
                icon: TrashIcon,
                danger: true,
                onSelect: onDelete,
                disabled: stats.shows > 0,
                hint: stats.shows > 0 ? `Has ${plural(stats.shows, 'show')} on record` : undefined,
              },
            ]}
          >
            <MoreIcon className="h-4 w-4" />
          </Menu>
        </div>
      </div>

      {theater.amenities.length ? (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {theater.amenities.map((amenity) => (
            <Tag key={amenity}>{amenity}</Tag>
          ))}
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-500">
          {theater.screens.length
            ? `${plural(theater.screens.length, 'screen')} · ${plural(theater.seatCount, 'seat')}`
            : 'No screens yet'}
        </p>
        {theater.screens.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {theater.screens.map((screen) => (
              <li
                key={screen.id}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-ink-950/50 px-2.5 py-1 text-xs text-ink-200"
              >
                <span className="font-semibold">{screen.name}</span>
                <span className="text-ink-500">{screen.formats.join(' · ')}</span>
                <span className="tabular-nums text-ink-400">{screen.seats}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.06] pt-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-500">Today</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink-100">
            {plural(theater.today.shows, 'show')}
          </dd>
          <dd className="text-xs text-ink-400">{plural(theater.today.movies, 'movie')}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Coming up</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink-100">
            {plural(stats.upcomingShows, 'show')}
          </dd>
          <dd className="text-xs text-ink-400">
            {stats.nextShowAt ? `Next ${showLabel(stats.nextShowAt)}` : 'Nothing scheduled'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Revenue</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink-50">{money(stats.revenue)}</dd>
          <dd className="text-xs text-ink-400">{plural(stats.ticketsSold, 'ticket')}</dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-ink-500">Sold ahead</dt>
          <dd>
            <OccupancyBar sold={stats.occupancy.sold} capacity={stats.occupancy.capacity} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

function chipsFor(
  query: TheatersQuery,
  update: (patch: Partial<TheatersQuery>) => void,
): FilterChip[] {
  return [
    ...query.amenities.map((amenity) => ({
      key: `a-${amenity}`,
      label: amenity,
      remove: () => update({ amenities: query.amenities.filter((item) => item !== amenity) }),
    })),
    ...query.formats.map((format) => ({
      key: `f-${format}`,
      label: `Screens with ${format}`,
      remove: () => update({ formats: query.formats.filter((item) => item !== format) }),
    })),
    ...(query.schedule
      ? [
          {
            key: 'schedule',
            label: query.schedule === 'scheduled' ? 'Has upcoming shows' : 'No upcoming shows',
            remove: () => update({ schedule: null }),
          },
        ]
      : []),
  ];
}
