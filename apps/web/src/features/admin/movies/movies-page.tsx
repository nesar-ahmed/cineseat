'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AdminMovieSort,
  defaultSortOrder,
  type AdminMovie,
  type AdminMovieList,
} from '@cineseat/shared';
import { FilmIcon, PlusIcon } from '../../../components/ui/icons';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { useCatalogFilters } from '../../catalog/queries';
import { CERTIFICATE_LABEL } from '../../landing/content';
import { adminNewMovieHref } from '../links';
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
import { MovieBulkBar } from './bulk-bar';
import { MovieFilterDrawer } from './filter-drawer';
import {
  NO_FILTERS,
  SORT_LABEL,
  activeFilterCount,
  effectiveOrder,
  orderLabel,
  parseQuery,
  toApiParams,
  toSearchParams,
  type MoviesQuery,
  type StatusTab,
} from './list-query';
import { DeleteMovieDialog, useStatusSwitch } from './movie-actions';
import { MoviesTable } from './movies-table';
import { useAdminMovies } from './queries';

const TABS: {
  id: StatusTab;
  label: string;
  count: (counts: AdminMovieList['counts']) => number;
}[] = [
  { id: 'all', label: 'All', count: (counts) => counts.all },
  { id: 'now', label: 'Now showing', count: (counts) => counts.NOW_SHOWING },
  { id: 'soon', label: 'Coming soon', count: (counts) => counts.COMING_SOON },
];

const SORTS = AdminMovieSort.options.map((value) => ({ value, label: SORT_LABEL[value] }));

/**
 * `/admin/movies`: every title with what it is doing — status, release, upcoming
 * shows, tickets and revenue — searchable, filterable and sortable by any of
 * those, with the whole view in the URL. Rows open the movie; "⋯" has the
 * quick actions; selecting rows brings up bulk actions.
 */
export function AdminMoviesPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { query, setQuery, hrefWith } = useUrlQuery(parseQuery, toSearchParams);
  const params = useMemo(() => toApiParams(query), [query]);
  const list = useAdminMovies(user?.id, params);
  const vocabulary = useCatalogFilters();
  const { switchStatus, pendingId } = useStatusSwitch();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminMovie | null>(null);
  const selection = useSelection(toSearchParams(query).toString());

  /** Any change of view goes back to page 1 — unless the page is what changes. */
  const update = useCallback(
    (patch: Partial<MoviesQuery>) => setQuery({ page: 1, ...patch }),
    [setQuery],
  );
  const goTo = useCallback((page: number) => setQuery({ page }), [setQuery]);
  const data = list.data;
  usePageClamp(data, list.isPlaceholderData, query.page, goTo);

  const items = data?.items ?? [];
  const filters = activeFilterCount(query);
  const filtered = filters > 0 || query.q.trim() !== '';
  const order = effectiveOrder(query);

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        eyebrow="Catalog"
        title="Movies"
        description={
          data
            ? `${plural(data.counts.all, 'title')}${filtered ? ' match your search and filters' : ' in the catalog'} · ${data.counts.NOW_SHOWING.toLocaleString('en-US')} now showing · ${data.counts.COMING_SOON.toLocaleString('en-US')} coming soon`
            : 'Every title in the catalog, with its schedule and sales.'
        }
        actions={
          <>
            <RefreshButton
              onClick={() => void list.refetch()}
              busy={list.isFetching}
              label="Refresh the list"
            />
            <Link href={adminNewMovieHref} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              Add movie
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <TabPills
          label="Status"
          value={query.tab}
          onChange={(tab) => update({ tab })}
          tabs={TABS.map((tab) => ({ ...tab, count: data ? tab.count(data.counts) : null }))}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q })}
            label="Search movies"
            placeholder="Search title, director, cast, genre or id"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltersButton count={filters} onClick={() => setFiltersOpen(true)} />
            <SortControl
              id="movies-sort"
              sorts={SORTS}
              sort={query.sort}
              order={order}
              naturalOrder={defaultSortOrder}
              orderLabel={orderLabel}
              onChange={update}
            />
          </div>
        </div>
        <FilterChips chips={chipsFor(query, update)} onClearAll={() => update(NO_FILTERS)} />
      </div>

      {list.isPending ? (
        <ListSkeleton label="Loading movies" />
      ) : list.isError && !data ? (
        <ListError what="movies" message={list.error.message} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyResults
          icon={FilmIcon}
          filtered={filtered || query.tab !== 'all'}
          onClear={() => update({ ...NO_FILTERS, q: '', tab: 'all' })}
          emptyTitle="No movies yet"
          emptyText="Add the first title; you can schedule its shows once it’s in the catalog."
          action={
            <Link href={adminNewMovieHref} className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              Add movie
            </Link>
          }
        />
      ) : (
        <section aria-label="Results">
          <MoviesTable
            movies={items}
            sort={query.sort}
            order={order}
            onSort={(column) => update(nextSort(column, { sort: query.sort, order }))}
            selected={selection.selected}
            onToggle={selection.toggle}
            onToggleAll={(select) =>
              select ? selection.setAll(items.map((movie) => movie.id)) : selection.clear()
            }
            onSwitchStatus={(movie) => switchStatus(movie)}
            onDelete={(movie) => setDeleting(movie)}
            pendingId={pendingId}
            now={now}
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

      <MovieFilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={query}
        onApply={update}
        genres={vocabulary.data?.genres ?? []}
        languages={vocabulary.data?.languages ?? []}
      />
      <DeleteMovieDialog
        movie={deleting ? { ...deleting, shows: deleting.stats.shows } : null}
        onClose={() => setDeleting(null)}
      />
      <MovieBulkBar
        selected={items.filter((movie) => selection.selected.has(movie.id))}
        onClear={selection.clear}
        onDone={selection.setAll}
      />
    </div>
  );
}

/** The filters in effect, each removable on its own. */
function chipsFor(query: MoviesQuery, update: (patch: Partial<MoviesQuery>) => void): FilterChip[] {
  const without =
    <K extends keyof MoviesQuery>(key: K, value: unknown) =>
    () =>
      update({
        [key]: (query[key] as unknown[]).filter((item) => item !== value),
      } as Partial<MoviesQuery>);
  return [
    ...query.genres.map((genre) => ({
      key: `g-${genre}`,
      label: genre,
      remove: without('genres', genre),
    })),
    ...query.languages.map((language) => ({
      key: `l-${language}`,
      label: language,
      remove: without('languages', language),
    })),
    ...query.certificates.map((cert) => ({
      key: `c-${cert}`,
      label: `${cert} · ${CERTIFICATE_LABEL[cert].split(' — ')[0]}`,
      remove: without('certificates', cert),
    })),
    ...query.formats.map((format) => ({
      key: `f-${format}`,
      label: `Released in ${format}`,
      remove: without('formats', format),
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
    ...(query.poster
      ? [
          {
            key: 'poster',
            label: query.poster === 'with' ? 'Poster uploaded' : 'Poster missing',
            remove: () => update({ poster: null }),
          },
        ]
      : []),
    ...(query.from || query.to
      ? [
          {
            key: 'release',
            label: `Released ${
              query.from && query.to
                ? `${shortDate(query.from)} – ${shortDate(query.to)}`
                : query.from
                  ? `from ${shortDate(query.from)}`
                  : `until ${shortDate(query.to!)}`
            }`,
            remove: () => update({ from: null, to: null }),
          },
        ]
      : []),
  ];
}
