'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AdminShowSort,
  AdminShowWhen,
  ShowAvailability,
  ShowFormat,
  defaultShowSortOrder,
  type AdminShow,
  type AdminShowList,
} from '@cineseat/shared';
import { CalendarIcon, GridIcon, ListIcon, PlusIcon } from '../../../components/ui/icons';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { cinemaToday } from '../../catalog/format';
import { useCatalogFilters } from '../../catalog/queries';
import { adminScheduleHref } from '../links';
import { useAdminMovies } from '../movies/queries';
import { useAllTheaters } from '../theaters/queries';
import {
  Choice,
  DateRange,
  FilterDrawer,
  FilterGroup,
  TogglePills,
  toggleIn,
} from '../ui/filter-kit';
import { plural, shortDate } from '../ui/format';
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
  nextSort,
  usePageClamp,
  useSelection,
  type FilterChip,
} from '../ui/list-kit';
import { PageHeader } from '../ui/page-kit';
import { useUrlQuery } from '../use-url-query';
import { lockReason, showName } from './bits';
import { ShowBulkBar } from './bulk-bar';
import { DayBoard } from './day-board';
import {
  AVAILABILITY_LABEL,
  NO_FILTERS,
  SORT_LABEL,
  activeFilterCount,
  effectiveOrder,
  orderLabel,
  parseQuery,
  toApiParams,
  toBoardParams,
  toSearchParams,
  type FilterPatch,
  type ShowsQuery,
  type ShowsView,
} from './list-query';
import { useAdminShows } from './queries';
import { CancelShowDialog } from './show-actions';
import { ShowDialog } from './show-dialog';
import { ShowsTable } from './shows-table';

const WHEN_LABEL: Record<AdminShowWhen, string> = {
  upcoming: 'Upcoming',
  today: 'Today',
  past: 'Past',
  all: 'All',
};
const SORTS = AdminShowSort.options.map((value) => ({ value, label: SORT_LABEL[value] }));

/**
 * `/admin/showtimes`: every show, as a list (tabs for upcoming, today, past and
 * all; search, filters, sort, pages, bulk actions) or as a day board (one day,
 * screen by screen, on a time axis). The whole view is in the URL, so a
 * theater's or a movie's showtimes are a link away.
 */
export function AdminShowsPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { query, setQuery, hrefWith } = useUrlQuery(parseQuery, toSearchParams);
  const board = query.view === 'board';
  const day = query.day ?? (now ? cinemaToday(now) : null);

  const listParams = useMemo(() => toApiParams(query), [query]);
  const boardParams = useMemo(() => (day ? toBoardParams(query, day) : {}), [query, day]);
  const list = useAdminShows(user?.id, listParams, { enabled: !board });
  const boardShows = useAdminShows(user?.id, boardParams, { enabled: board && day !== null });

  const theaters = useAllTheaters(user?.id);
  const movies = useAdminMovies(user?.id, { sort: 'title', pageSize: 100 });
  const languages = useCatalogFilters().data?.languages ?? [];

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<AdminShow | null>(null);
  const [cancelling, setCancelling] = useState<AdminShow | null>(null);
  const selection = useSelection(toSearchParams(query).toString());

  const update = useCallback(
    (patch: Partial<ShowsQuery>) => setQuery({ page: 1, ...patch }),
    [setQuery],
  );
  const goTo = useCallback((page: number) => setQuery({ page }), [setQuery]);
  const data = list.data;
  usePageClamp(data, list.isPlaceholderData, query.page, goTo);

  const vocabulary = useVocabulary(theaters.data?.items ?? [], movies.data?.items ?? []);
  const items = data?.items ?? [];
  const filters = activeFilterCount(query);
  const filtered = filters > 0 || query.q.trim() !== '';
  const order = effectiveOrder(query);

  // The board's lanes: the cinemas (and screens) the filters leave in.
  const boardTheaters = (theaters.data?.items ?? [])
    .filter((theater) => !query.theaters.length || query.theaters.includes(theater.id))
    .filter(
      (theater) =>
        !query.cities.length ||
        query.cities.some((city) => city.toLowerCase() === theater.city.toLowerCase()),
    )
    .map((theater) =>
      query.screens.length
        ? {
            ...theater,
            screens: theater.screens.filter((screen) => query.screens.includes(screen.id)),
          }
        : theater,
    )
    .filter((theater) => !query.screens.length || theater.screens.length > 0);

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        eyebrow="Catalog"
        title="Showtimes"
        description={
          data && !board
            ? `${plural(data.counts.upcoming, 'upcoming show')} · ${plural(data.counts.today, 'show')} today${
                filtered ? ' matching your search and filters' : ''
              }`
            : 'Every show across the cinemas: schedule, seats and sales.'
        }
        actions={
          <>
            <RefreshButton
              onClick={() => void (board ? boardShows.refetch() : list.refetch())}
              busy={board ? boardShows.isFetching : list.isFetching}
              label="Refresh"
            />
            <ViewSwitch view={query.view} onChange={(view) => update({ view })} />
            <Link
              href={adminScheduleHref({
                movie: query.movies.length === 1 ? query.movies[0] : undefined,
                theater: query.theaters.length === 1 ? query.theaters[0] : undefined,
                screen: query.screens.length === 1 ? query.screens[0] : undefined,
              })}
              className="btn-primary"
            >
              <PlusIcon className="h-4 w-4" />
              Schedule shows
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {board ? null : (
          <TabPills
            label="When"
            value={query.when}
            onChange={(when) => update({ when, order: null })}
            tabs={AdminShowWhen.options.map((when) => ({
              id: when,
              label: WHEN_LABEL[when],
              count: data ? (data.counts as AdminShowList['counts'])[when] : null,
            }))}
          />
        )}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q })}
            label="Search showtimes"
            placeholder="Search movie, theater, screen, city or show id"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltersButton count={filters} onClick={() => setFiltersOpen(true)} />
            {board ? null : (
              <SortControl
                id="shows-sort"
                sorts={SORTS}
                sort={query.sort}
                order={order}
                naturalOrder={(sort) => defaultShowSortOrder(sort, query.when)}
                orderLabel={orderLabel}
                onChange={update}
              />
            )}
          </div>
        </div>
        <FilterChips
          chips={chipsFor(query, update, vocabulary, board)}
          onClearAll={() => update(NO_FILTERS)}
        />
      </div>

      {board ? (
        day ? (
          boardShows.isError && !boardShows.data ? (
            <ListError
              what="schedule"
              message={boardShows.error.message}
              onRetry={() => void boardShows.refetch()}
            />
          ) : (
            <DayBoard
              day={day}
              onDay={(next) => update({ day: next })}
              shows={boardShows.data?.items ?? []}
              theaters={boardTheaters}
              now={now}
              loading={boardShows.isFetching || theaters.isPending}
            />
          )
        ) : (
          <ListSkeleton label="Loading the schedule" rows={4} />
        )
      ) : list.isPending ? (
        <ListSkeleton label="Loading showtimes" />
      ) : list.isError && !data ? (
        <ListError
          what="showtimes"
          message={list.error.message}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyResults
          icon={CalendarIcon}
          filtered={filtered}
          onClear={() => update({ ...NO_FILTERS, q: '' })}
          emptyTitle={query.when === 'past' ? 'No past shows' : 'Nothing scheduled'}
          emptyText={
            query.when === 'past'
              ? 'Shows appear here once they have started.'
              : 'Schedule a movie on a screen — several dates and times at once.'
          }
          action={
            query.when === 'past' ? null : (
              <Link href={adminScheduleHref()} className="btn-primary">
                <PlusIcon className="h-4 w-4" />
                Schedule shows
              </Link>
            )
          }
        />
      ) : (
        <section aria-label="Results">
          <ShowsTable
            shows={items}
            sort={query.sort}
            order={order}
            onSort={(column) => update(nextSort(column, { sort: query.sort, order }))}
            selected={selection.selected}
            onToggle={selection.toggle}
            onToggleAll={(select) =>
              select ? selection.setAll(items.map((show) => show.id)) : selection.clear()
            }
            onEdit={setEditing}
            onCancel={setCancelling}
            stale={list.isPlaceholderData}
          />
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
        title="Filter showtimes"
        value={query}
        empty={NO_FILTERS}
        onApply={update}
      >
        {(draft, set) => {
          const chosenTheaters = vocabulary.theaters.filter((theater) =>
            draft.theaters.includes(theater.id),
          );
          return (
            <>
              {board ? null : (
                <FilterGroup label="Days" hint="Cinema days, on top of the tab">
                  <DateRange from={draft.from} to={draft.to} onChange={(range) => set(range)} />
                </FilterGroup>
              )}
              <FilterGroup label="Theaters">
                <TogglePills
                  options={vocabulary.theaters.map((theater) => ({
                    value: theater.id,
                    label: theater.name,
                  }))}
                  chosen={draft.theaters}
                  onToggle={(id) =>
                    set({
                      theaters: toggleIn(draft.theaters, id),
                      // Screens belong to a theater: drop those of one taken out.
                      screens: draft.screens.filter(
                        (screenId) =>
                          vocabulary.screenTheater.get(screenId) !== id ||
                          !draft.theaters.includes(id),
                      ),
                    })
                  }
                />
              </FilterGroup>
              {chosenTheaters.length ? (
                <FilterGroup label="Screens" hint="Of the theaters chosen">
                  <TogglePills
                    options={chosenTheaters.flatMap((theater) =>
                      theater.screens.map((screen) => ({
                        value: screen.id,
                        label:
                          chosenTheaters.length > 1
                            ? `${theater.name.replace(/^CineSeat /, '')} · ${screen.name}`
                            : screen.name,
                      })),
                    )}
                    chosen={draft.screens}
                    onToggle={(id) => set({ screens: toggleIn(draft.screens, id) })}
                  />
                </FilterGroup>
              ) : null}
              <FilterGroup label="Cities">
                <TogglePills
                  options={vocabulary.cities}
                  chosen={draft.cities}
                  onToggle={(city) => set({ cities: toggleIn(draft.cities, city) })}
                />
              </FilterGroup>
              <FilterGroup label="Movies" hint="Any of these">
                <TogglePills
                  options={vocabulary.movies.map((movie) => ({
                    value: movie.id,
                    label: movie.title,
                  }))}
                  chosen={draft.movies}
                  onToggle={(id) => set({ movies: toggleIn(draft.movies, id) })}
                />
              </FilterGroup>
              <FilterGroup label="Format">
                <TogglePills
                  options={ShowFormat.options}
                  chosen={draft.formats}
                  onToggle={(format) =>
                    set({ formats: toggleIn(draft.formats, format as ShowFormat) })
                  }
                />
              </FilterGroup>
              <FilterGroup label="Language">
                <TogglePills
                  options={languages}
                  chosen={draft.languages}
                  onToggle={(language) => set({ languages: toggleIn(draft.languages, language) })}
                />
              </FilterGroup>
              <FilterGroup label="How full" hint="Seats sold or held">
                <TogglePills
                  options={ShowAvailability.options.map((value) => ({
                    value,
                    label: AVAILABILITY_LABEL[value],
                  }))}
                  chosen={draft.availability}
                  onToggle={(value) =>
                    set({ availability: toggleIn(draft.availability, value as ShowAvailability) })
                  }
                />
              </FilterGroup>
              <FilterGroup label="Tickets">
                <Choice
                  options={[
                    ['', 'Any'],
                    ['sold', 'Some sold'],
                    ['unsold', 'None sold'],
                  ]}
                  value={draft.tickets ?? ''}
                  onChange={(tickets) =>
                    set({ tickets: (tickets || null) as FilterPatch['tickets'] })
                  }
                />
              </FilterGroup>
            </>
          );
        }}
      </FilterDrawer>

      <ShowDialog
        show={editing}
        lockedReason={editing ? lockReason(editing) : null}
        onClose={() => setEditing(null)}
      />
      <CancelShowDialog
        show={
          cancelling ? { id: cancelling.id, name: showName(cancelling), blockedReason: null } : null
        }
        onClose={() => setCancelling(null)}
      />
      {board ? null : (
        <ShowBulkBar
          selected={items.filter((show) => selection.selected.has(show.id))}
          onClear={selection.clear}
          onDone={selection.setAll}
        />
      )}
    </div>
  );
}

function ViewSwitch({ view, onChange }: { view: ShowsView; onChange: (view: ShowsView) => void }) {
  const options: { value: ShowsView; label: string; icon: typeof ListIcon }[] = [
    { value: 'list', label: 'List', icon: ListIcon },
    { value: 'board', label: 'Day board', icon: GridIcon },
  ];
  return (
    <div
      role="group"
      aria-label="View"
      className="flex rounded-full border border-ink-700 bg-ink-900/60 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition motion-reduce:transition-none ${
            view === option.value ? 'bg-white/[0.1] text-ink-50' : 'text-ink-400 hover:text-ink-100'
          }`}
        >
          <option.icon className="h-4 w-4" />
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

type Vocabulary = ReturnType<typeof useVocabulary>;

/** Names for the ids in the URL (chips, pills), from the theaters and movies already loaded. */
function useVocabulary(
  theaters: { id: string; name: string; city: string; screens: { id: string; name: string }[] }[],
  movies: { id: string; title: string }[],
) {
  return useMemo(() => {
    const screenTheater = new Map<string, string>();
    const screenName = new Map<string, string>();
    for (const theater of theaters)
      for (const screen of theater.screens) {
        screenTheater.set(screen.id, theater.id);
        screenName.set(screen.id, `${theater.name} · ${screen.name}`);
      }
    return {
      theaters,
      movies,
      cities: [...new Set(theaters.map((theater) => theater.city))],
      screenTheater,
      theaterName: new Map(theaters.map((theater) => [theater.id, theater.name])),
      screenName,
      movieTitle: new Map(movies.map((movie) => [movie.id, movie.title])),
    };
  }, [theaters, movies]);
}

function chipsFor(
  query: ShowsQuery,
  update: (patch: Partial<ShowsQuery>) => void,
  vocabulary: Vocabulary,
  board: boolean,
): FilterChip[] {
  const drop =
    <
      K extends
        'movies' | 'theaters' | 'screens' | 'cities' | 'formats' | 'languages' | 'availability',
    >(
      key: K,
      value: string,
    ) =>
    () =>
      update({
        [key]: (query[key] as string[]).filter((item) => item !== value),
      } as Partial<ShowsQuery>);
  return [
    ...(!board && (query.from || query.to)
      ? [
          {
            key: 'days',
            label:
              query.from && query.to
                ? query.from === query.to
                  ? shortDate(query.from)
                  : `${shortDate(query.from)} – ${shortDate(query.to)}`
                : query.from
                  ? `From ${shortDate(query.from)}`
                  : `Until ${shortDate(query.to!)}`,
            remove: () => update({ from: null, to: null }),
          },
        ]
      : []),
    ...query.theaters.map((id) => ({
      key: `t-${id}`,
      label: vocabulary.theaterName.get(id) ?? 'A theater',
      remove: drop('theaters', id),
    })),
    ...query.screens.map((id) => ({
      key: `s-${id}`,
      label: vocabulary.screenName.get(id) ?? 'A screen',
      remove: drop('screens', id),
    })),
    ...query.cities.map((city) => ({
      key: `c-${city}`,
      label: city,
      remove: drop('cities', city),
    })),
    ...query.movies.map((id) => ({
      key: `m-${id}`,
      label: vocabulary.movieTitle.get(id) ?? 'A movie',
      remove: drop('movies', id),
    })),
    ...query.formats.map((format) => ({
      key: `f-${format}`,
      label: format,
      remove: drop('formats', format),
    })),
    ...query.languages.map((language) => ({
      key: `l-${language}`,
      label: language,
      remove: drop('languages', language),
    })),
    ...query.availability.map((value) => ({
      key: `a-${value}`,
      label: AVAILABILITY_LABEL[value],
      remove: drop('availability', value),
    })),
    ...(query.tickets
      ? [
          {
            key: 'tickets',
            label: query.tickets === 'sold' ? 'Some tickets sold' : 'No tickets sold',
            remove: () => update({ tickets: null }),
          },
        ]
      : []),
  ];
}
