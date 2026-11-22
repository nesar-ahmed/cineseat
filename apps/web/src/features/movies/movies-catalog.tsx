'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CatalogFacets, CatalogFilters, MovieStatus, Showtime } from '@cineseat/shared';
import {
  CloseIcon,
  GridIcon,
  HeartIcon,
  ListIcon,
  MapPinIcon,
  SearchIcon,
  SlidersIcon,
  StarIcon,
} from '../../components/ui/icons';
import { Overlay } from '../../components/ui/overlay';
import { useHydrated } from '../../hooks/use-hydrated';
import { useNow } from '../../hooks/use-now';
import { useWatchlist } from '../../hooks/use-watchlist';
import type { CatalogMovie } from '../catalog/art';
import { cinemaToday, compact, dayInfo, releaseLabel, runtime, time12 } from '../catalog/format';
import { movieHref, type MovieLinkContext } from '../catalog/links';
import { MovieCard } from '../catalog/movie-card';
import { PosterArt } from '../catalog/poster-art';
import { useCatalogFilters, useFacets, useMovieList, useShows } from '../catalog/queries';
import {
  RUNTIME_BANDS,
  SORTS,
  activeFilterCount,
  clearFilters,
  hasShowFilters,
  toApiParams,
  type CatalogQuery,
  type Sort,
  type Tab,
} from './catalog-query';
import { FilterPanel, toFacetCounts } from './filter-panel';
import { ShowtimeButton, canBook } from './showtime-button';
import { useCatalogQuery } from './use-catalog-query';

const TAB_LABEL: Record<Tab, string> = {
  now: 'Now showing',
  soon: 'Coming soon',
  all: 'All movies',
};

/** Cards per request; "Show more" asks for the next page. */
const PAGE_SIZE = 24;
/** The watchlist is filtered in the browser, so saved views read the whole (filtered) catalog. */
const SAVED_PAGE_SIZE = 100;

const theaterShortName = (name: string) => name.replace('CineSeat ', '');

/**
 * The movies page. Everything on it comes from the API through the browser's
 * query cache, so it renders on the client only: the skeleton is what the
 * server sends, and hydration can never disagree with cached data.
 */
export function MoviesCatalog() {
  return useHydrated() ? <Catalog /> : <CatalogSkeleton />;
}

export function CatalogSkeleton() {
  return (
    <div
      className="container-x animate-pulse pb-16 pt-14 motion-reduce:animate-none"
      aria-hidden="true"
    >
      <div className="h-3 w-40 rounded bg-white/[0.06]" />
      <div className="mt-4 h-12 w-64 rounded-xl bg-white/[0.06]" />
      <div className="mt-10 h-11 w-full rounded-full bg-white/[0.04]" />
      <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="aspect-[2/3] rounded-2xl bg-white/[0.05]" />
            <div className="mt-3 h-3 w-3/4 rounded bg-white/[0.06]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Catalog() {
  const { query, setQuery } = useCatalogQuery();
  const { ids: savedIds } = useWatchlist();
  const now = useNow();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The search box types into local state; the URL follows a moment later.
  const [term, setTerm] = useState(query.q);
  const lastPushed = useRef(query.q);
  useEffect(() => {
    if (query.q !== lastPushed.current) {
      lastPushed.current = query.q;
      setTerm(query.q);
    }
  }, [query.q]);
  useEffect(() => {
    if (term === query.q) return;
    const id = window.setTimeout(() => {
      lastPushed.current = term;
      setQuery({ q: term });
    }, 200);
    return () => window.clearTimeout(id);
  }, [term, query.q, setQuery]);

  const filtersQuery = useCatalogFilters();
  const vocabulary = filtersQuery.data;
  const apiParams = useMemo(() => toApiParams(query), [query]);

  // Results. The API filters and sorts; only the watchlist is applied here.
  const list = useMovieList({ ...apiParams, pageSize: query.saved ? SAVED_PAGE_SIZE : PAGE_SIZE });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (query.saved && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [query.saved, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const results = useMemo(() => {
    const movies = list.data?.pages.flatMap((page) => page.items) ?? [];
    if (!query.saved) return movies;
    const saved = new Set(savedIds);
    return movies.filter((movie) => saved.has(movie.id));
  }, [list.data, query.saved, savedIds]);
  const total = query.saved ? results.length : (list.data?.pages[0]?.total ?? 0);
  const loading = !list.data && !list.isError;
  const counts = useTabCounts(query);
  const facetCounts = useMemo(
    () => (!query.saved && counts.facets ? toFacetCounts(counts.facets) : null),
    [query.saved, counts.facets],
  );

  // Next showtimes for the cards on screen, honouring the where/when/format filters.
  const showingIds = results
    .filter((movie) => movie.status === 'NOW_SHOWING')
    .map((movie) => movie.id);
  const shows = useShows(
    {
      movie: showingIds,
      city: apiParams.city,
      theater: apiParams.theater,
      date: apiParams.date,
      format: apiParams.format,
    },
    { enabled: showingIds.length > 0 && query.tab !== 'soon' },
  );
  const showsByMovie = useMemo(() => {
    const map = new Map<string, Showtime[]>();
    for (const show of shows.data ?? [])
      map.set(show.movieId, [...(map.get(show.movieId) ?? []), show]);
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [shows.data]);

  const filters = activeFilterCount(query);
  const showFilters = hasShowFilters(query);
  const heading = query.city ? `Movies in ${query.city}` : 'Movies';
  // A movie's page opens on the city and day being browsed here (they rest on "Coming soon").
  const linkContext: MovieLinkContext =
    query.tab !== 'soon' ? { city: query.city, date: query.date } : {};
  const hrefFor = (movie: CatalogMovie, show?: string) =>
    movieHref(movie.id, movie.status === 'NOW_SHOWING' ? { ...linkContext, show } : {});

  return (
    <div className="pb-10">
      {/* Page header */}
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-40 h-[380px] w-[560px] rounded-full bg-brand-600/15 blur-[120px]"
        />
        <div className="container-x relative pb-0 pt-10 sm:pt-14">
          <p className="section-label">Tickets · Dhaka &amp; Chattogram</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-4xl font-semibold tracking-tight text-ink-50 sm:text-6xl">
              {heading}
            </h1>
            {counts.tabs && !query.saved ? (
              <p className="text-sm text-ink-400">
                {counts.tabs.now} in cinemas · {counts.tabs.soon} coming soon
              </p>
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label="Catalog"
            className="mt-8 flex gap-6 overflow-x-auto no-scrollbar sm:gap-8"
          >
            {(['now', 'soon', 'all'] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={query.tab === tab}
                onClick={() => setQuery({ tab })}
                className={`relative shrink-0 pb-4 text-[15px] font-semibold transition motion-reduce:transition-none ${
                  query.tab === tab ? 'text-ink-50' : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                {TAB_LABEL[tab]}
                {counts.tabs && !query.saved ? (
                  <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs tabular-nums text-ink-400">
                    {counts.tabs[tab]}
                  </span>
                ) : null}
                {query.tab === tab ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-500"
                  />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky toolbar: search, dates, sort, view */}
      <div className="sticky top-16 z-30 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-xl sm:top-[72px]">
        {/* One row on wide screens; below xl the date rail drops to its own full-width row. */}
        <div className="container-x flex flex-wrap items-center gap-3 py-3">
          <label className="relative flex min-w-[14rem] flex-1 items-center md:max-w-sm xl:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-400" />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search by title, cast or genre"
              aria-label="Search movies"
              maxLength={80}
              className="input h-11 rounded-full pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {term ? (
              <button
                type="button"
                onClick={() => setTerm('')}
                aria-label="Clear search"
                className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-400 hover:bg-white/10 hover:text-ink-100"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          {query.tab !== 'soon' ? (
            <div
              role="group"
              aria-label="Show date"
              className="rail order-last w-full min-w-0 gap-1.5 pb-0 sm:gap-1.5 xl:order-none xl:w-auto xl:flex-1"
            >
              <DayChip
                label="Any day"
                pressed={query.date === null}
                onClick={() => setQuery({ date: null })}
              />
              {(vocabulary?.dates ?? []).map((date) => (
                <DayChip
                  key={date}
                  label={dayInfo(date).label}
                  pressed={query.date === date}
                  onClick={() => setQuery({ date: query.date === date ? null : date })}
                />
              ))}
            </div>
          ) : (
            <div className="hidden flex-1 xl:block" />
          )}

          <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn-ghost h-11 flex-1 border-white/10 px-4 py-0 lg:hidden"
            >
              <SlidersIcon className="h-4 w-4" />
              Filters
              {filters ? (
                <span className="rounded-full bg-brand-500 px-1.5 text-[11px] text-white">
                  {filters}
                </span>
              ) : null}
            </button>
            <label className="relative flex-1 md:flex-none">
              <span className="sr-only">Sort by</span>
              <select
                value={query.sort}
                onChange={(event) => setQuery({ sort: event.target.value as Sort })}
                className="select h-11 rounded-full md:w-44"
              >
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.value === 'release' && query.tab === 'soon'
                      ? 'Release: soonest'
                      : sort.label}
                  </option>
                ))}
              </select>
            </label>
            <div
              role="group"
              aria-label="Layout"
              className="hidden rounded-full border border-white/10 p-1 sm:flex"
            >
              {(['grid', 'list'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={query.view === view}
                  aria-label={view === 'grid' ? 'Grid view' : 'List view'}
                  onClick={() => setQuery({ view })}
                  className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition ${query.view === view ? 'bg-white text-ink-950' : 'text-ink-400 hover:text-ink-100'}`}
                >
                  {view === 'grid' ? (
                    <GridIcon className="h-4 w-4" />
                  ) : (
                    <ListIcon className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container-x grid gap-10 pt-8 lg:grid-cols-[270px_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-[calc(72px+4.75rem)] max-h-[calc(100vh-72px-6rem)] overflow-y-auto pb-6 pr-3 [scrollbar-color:theme(colors.ink.700)_transparent] [scrollbar-width:thin]">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-sans text-sm font-semibold text-ink-50">Filters</h2>
              {filters ? (
                <button
                  type="button"
                  onClick={() => setQuery(clearFilters(query))}
                  className="text-xs font-semibold text-brand-300 hover:text-brand-200"
                >
                  Clear all ({filters})
                </button>
              ) : null}
            </div>
            <FilterPanel
              query={query}
              filters={vocabulary}
              counts={facetCounts}
              savedCount={savedIds.length}
              onChange={setQuery}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <h2 className="sr-only">Results</h2>
          <ActiveFilters query={query} filters={vocabulary} onChange={setQuery} />

          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink-400" aria-live="polite">
              {loading ? (
                'Loading movies…'
              ) : list.isError && !list.data ? null : (
                <>
                  <span className="font-semibold text-ink-100">{total}</span>{' '}
                  {total === 1 ? 'movie' : 'movies'}
                  {query.q ? (
                    <>
                      {' '}
                      for “<span className="text-ink-100">{query.q}</span>”
                    </>
                  ) : null}
                  {query.date !== null && query.tab !== 'soon' ? (
                    <> · showing {dayPhrase(query.date)}</>
                  ) : null}
                </>
              )}
            </p>
            {showFilters && query.tab === 'all' ? (
              <p className="text-xs text-ink-400">
                Upcoming titles are hidden while a cinema, date or format is selected.
              </p>
            ) : null}
          </div>

          {list.isError && !list.data ? (
            <div className="card flex flex-col items-center rounded-3xl px-6 py-16 text-center">
              <h2 className="font-display text-2xl font-semibold text-ink-50">
                Couldn’t load movies
              </h2>
              <p className="mt-2 max-w-md text-sm text-ink-400">{list.error.message}</p>
              <button
                type="button"
                onClick={() => void list.refetch()}
                className="btn-primary mt-7"
              >
                Try again
              </button>
            </div>
          ) : loading || (query.saved && hasNextPage) ? (
            <ResultsSkeleton view={query.view} />
          ) : results.length === 0 ? (
            <EmptyState
              query={query}
              savedCount={savedIds.length}
              onReset={() => setQuery({ ...clearFilters(query), q: '', tab: 'all' })}
              onChange={setQuery}
            />
          ) : (
            // Previous results stay on screen, dimmed, while a new filter loads.
            <div
              aria-busy={list.isPlaceholderData}
              className={`transition-opacity motion-reduce:transition-none ${list.isPlaceholderData ? 'opacity-60' : ''}`}
            >
              {query.view === 'grid' ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 xl:grid-cols-4">
                  {results.map((movie) => (
                    <li key={movie.id} className="animate-fade-up motion-reduce:animate-none">
                      <MovieCard
                        movie={movie}
                        href={hrefFor(movie)}
                        footer={
                          <NextShow movie={movie} shows={showsByMovie.get(movie.id)} now={now} />
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-4">
                  {results.map((movie) => (
                    <li key={movie.id} className="animate-fade-up motion-reduce:animate-none">
                      <MovieRow
                        movie={movie}
                        day={query.date ?? cinemaToday()}
                        shows={showsByMovie.get(movie.id)}
                        showsLoading={shows.isPending && query.tab !== 'soon'}
                        now={now}
                        href={hrefFor(movie)}
                        showHref={(show) => hrefFor(movie, show)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {!query.saved && hasNextPage ? (
                <div className="mt-10 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="btn-ghost disabled:opacity-60"
                  >
                    {isFetchingNextPage ? 'Loading…' : 'Show more'}
                  </button>
                  <p className="text-xs text-ink-400">
                    Showing {results.length} of {total}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Filters on small screens: a bottom sheet with a live result count. */}
      <Overlay
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        labelledBy="filters-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-[28px] border-t border-white/10 bg-ink-950 motion-reduce:animate-none lg:hidden"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2 id="filters-title" className="font-sans text-base font-semibold text-ink-50">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close filters"
            className="btn-icon h-9 w-9"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <FilterPanel
            query={query}
            filters={vocabulary}
            counts={facetCounts}
            savedCount={savedIds.length}
            onChange={setQuery}
          />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-3 border-t border-white/[0.06] p-4">
          <button
            type="button"
            onClick={() => setQuery(clearFilters(query))}
            disabled={filters === 0}
            className="btn-ghost disabled:opacity-40"
          >
            Clear
          </button>
          <button type="button" onClick={() => setDrawerOpen(false)} className="btn-primary">
            {loading ? 'Show movies' : `Show ${total} ${total === 1 ? 'movie' : 'movies'}`}
          </button>
        </div>
      </Overlay>
    </div>
  );
}

/**
 * Result counts for the tabs and the filter panel, from GET /catalog/facets.
 * The status facet of one request gives every tab's count, except where a tab
 * sets filters aside ("Coming soon" ignores where/when/format and rating): then
 * the other tabs' counts come from a second request with their own filters.
 */
function useTabCounts(query: CatalogQuery): {
  facets: CatalogFacets | undefined;
  tabs: Record<Tab, number> | null;
} {
  const onSoon = query.tab === 'soon';
  const showFilters = hasShowFilters({ ...query, tab: 'now' });
  const needOther = onSoon ? showFilters || query.minRating !== null : query.minRating !== null;
  const main = useFacets(toApiParams(query));
  const other = useFacets(toApiParams({ ...query, tab: onSoon ? 'now' : 'soon' }), {
    enabled: needOther,
  });

  const count = (facets: CatalogFacets | undefined, status: MovieStatus) =>
    facets?.status.find((option) => option.value === status)?.count;
  const showing = onSoon && needOther ? other.data : main.data;
  const nowCount = count(showing, 'NOW_SHOWING');
  const soonCount = onSoon
    ? main.data?.total
    : needOther
      ? other.data?.total
      : count(main.data, 'COMING_SOON');
  const soonInAll = count(showing, 'COMING_SOON');

  const tabs =
    nowCount === undefined || soonCount === undefined || soonInAll === undefined
      ? null
      : { now: nowCount, soon: soonCount, all: nowCount + (showFilters ? 0 : soonInAll) };
  return { facets: main.data, tabs };
}

/** "today", "tomorrow", "on Fri, 14 Nov". */
function dayPhrase(date: string): string {
  const info = dayInfo(date);
  return info.offset === 0 || info.offset === 1 ? info.label.toLowerCase() : `on ${info.long}`;
}

function ResultsSkeleton({ view }: { view: CatalogQuery['view'] }) {
  return (
    <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] rounded-2xl bg-white/[0.05]" />
              <div className="mt-3 h-3.5 w-3/4 rounded bg-white/[0.06]" />
              <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card h-48 rounded-3xl" />
          ))}
        </div>
      )}
    </div>
  );
}

function DayChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-11 shrink-0 snap-start rounded-full border px-4 text-sm font-semibold transition motion-reduce:transition-none ${
        pressed
          ? 'border-white bg-white text-ink-950'
          : 'border-white/10 text-ink-300 hover:border-white/25 hover:text-ink-50'
      }`}
    >
      {label}
    </button>
  );
}

/** One chip per active filter, each removable on its own. */
function ActiveFilters({
  query,
  filters,
  onChange,
}: {
  query: CatalogQuery;
  filters: CatalogFilters | undefined;
  onChange: (patch: Partial<CatalogQuery>) => void;
}) {
  const cinemaName = (id: string) => {
    const theater = filters?.theaters.find((item) => item.id === id);
    return theater ? theaterShortName(theater.name) : 'Cinema';
  };
  const runtimeLabel = RUNTIME_BANDS.find((band) => band.value === query.runtime)?.label ?? '';
  // `text` names the chip for screen readers ("Remove Drama filter").
  // Where/when/format rest on the "Coming soon" tab (see hasShowFilters), so their chips hide too.
  const shows = query.tab !== 'soon';
  const chips: { key: string; text: string; label: ReactNode; remove: () => void }[] = [
    ...(query.saved
      ? [
          {
            key: 'saved',
            text: 'Saved',
            label: (
              <>
                <HeartIcon filled className="h-3.5 w-3.5 text-brand-400" /> Saved
              </>
            ),
            remove: () => onChange({ saved: false }),
          },
        ]
      : []),
    ...(shows && query.city
      ? [
          {
            key: 'city',
            text: query.city,
            label: (
              <>
                <MapPinIcon className="h-3.5 w-3.5" /> {query.city}
              </>
            ),
            remove: () => onChange({ city: null }),
          },
        ]
      : []),
    ...(shows ? query.cinemas : []).map((id) => ({
      key: `cinema-${id}`,
      text: cinemaName(id),
      label: cinemaName(id),
      remove: () => onChange({ cinemas: query.cinemas.filter((item) => item !== id) }),
    })),
    ...(shows && query.date !== null
      ? [
          {
            key: 'date',
            text: dayInfo(query.date).long,
            label: dayInfo(query.date).label,
            remove: () => onChange({ date: null }),
          },
        ]
      : []),
    ...(shows ? query.formats : []).map((format) => ({
      key: `format-${format}`,
      text: format,
      label: format,
      remove: () => onChange({ formats: query.formats.filter((item) => item !== format) }),
    })),
    ...query.genres.map((genre) => ({
      key: `genre-${genre}`,
      text: genre,
      label: genre,
      remove: () => onChange({ genres: query.genres.filter((item) => item !== genre) }),
    })),
    ...query.languages.map((language) => ({
      key: `lang-${language}`,
      text: language,
      label: language,
      remove: () => onChange({ languages: query.languages.filter((item) => item !== language) }),
    })),
    ...(query.minRating !== null && shows
      ? [
          {
            key: 'rating',
            text: `Rating ${query.minRating.toFixed(1)} and up`,
            label: (
              <>
                <StarIcon className="h-3.5 w-3.5 text-gold-400" /> {query.minRating.toFixed(1)}+
              </>
            ),
            remove: () => onChange({ minRating: null }),
          },
        ]
      : []),
    ...(query.runtime
      ? [
          {
            key: 'runtime',
            text: runtimeLabel,
            label: runtimeLabel,
            remove: () => onChange({ runtime: null }),
          },
        ]
      : []),
    ...query.certificates.map((certificate) => ({
      key: `cert-${certificate}`,
      text: `Rated ${certificate}`,
      label: `Rated ${certificate}`,
      remove: () =>
        onChange({ certificates: query.certificates.filter((item) => item !== certificate) }),
    })),
  ];
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="mb-5 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.remove}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 py-1.5 pl-3 pr-2 text-xs font-semibold text-ink-100 transition hover:border-brand-400"
            aria-label={`Remove ${chip.text} filter`}
          >
            {chip.label}
            <CloseIcon className="h-3.5 w-3.5 text-ink-400" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => onChange(clearFilters(query))}
          className="px-2 py-1.5 text-xs font-semibold text-ink-400 hover:text-ink-100"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
}

/** "Next: Today 6:00 PM · Gulshan" under a grid card, honouring the where/when filters. */
function NextShow({
  movie,
  shows,
  now,
}: {
  movie: CatalogMovie;
  shows: Showtime[] | undefined;
  now: number | null;
}) {
  if (movie.status !== 'NOW_SHOWING') return null;
  // The next one that can still be booked: a sold-out show is not much of a lead.
  const next = shows?.find((show) => canBook(show, now));
  if (!next) return null;
  return (
    <p className="mt-2 truncate text-[11px] text-ink-400">
      <span className="font-semibold text-emerald-400">Next</span> {dayInfo(next.date).label}{' '}
      {time12(next.time)} · {theaterShortName(next.theater.name)}
    </p>
  );
}

/** List view: more words and the day's showtimes grouped by cinema. */
function MovieRow({
  movie,
  day,
  shows,
  showsLoading,
  now,
  href,
  showHref,
}: {
  movie: CatalogMovie;
  /** The catalog's date, or today. */
  day: string;
  shows: Showtime[] | undefined;
  showsLoading: boolean;
  now: number | null;
  /** The movie's page. */
  href: string;
  /** The movie's page with one showtime already picked. */
  showHref: (show: string) => string;
}) {
  const router = useRouter();
  const { has, toggle } = useWatchlist();
  const todays = (shows ?? []).filter((show) => show.date === day);
  const theaters = Array.from(
    new Map(todays.map((show) => [show.theater.id, show.theater])).values(),
  );

  return (
    <article className="card flex gap-4 rounded-3xl p-3 sm:gap-6 sm:p-4">
      <Link href={href} className="w-24 shrink-0 sm:w-32" aria-label={`${movie.title} — details`}>
        <PosterArt
          movie={movie}
          className="aspect-[2/3] w-full rounded-2xl text-[10px] ring-1 ring-white/10 sm:text-xs"
        />
      </Link>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-semibold text-ink-50 sm:text-2xl">
              <Link href={href} className="hover:text-brand-200">
                {movie.title}
              </Link>
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-400">
              {movie.rating !== null ? (
                <span className="flex items-center gap-1">
                  <StarIcon className="h-3.5 w-3.5 text-gold-400" />
                  <span className="font-semibold text-ink-100">{movie.rating.toFixed(1)}</span> (
                  {compact(movie.votes)})
                </span>
              ) : (
                <span className="font-semibold text-gold-300">
                  {releaseLabel(movie.releaseDate)}
                </span>
              )}
              <span className="rounded border border-white/20 px-1 text-[10px] font-bold text-ink-100">
                {movie.certificate}
              </span>
              <span>{runtime(movie.durationMin)}</span>
              <span>{movie.genres.join(', ')}</span>
              <span>{movie.language}</span>
              {movie.formats.includes('3D') ? (
                <span className="rounded bg-gold-400/90 px-1 text-[10px] font-bold text-ink-950">
                  3D
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggle(movie.id)}
            aria-pressed={has(movie.id)}
            aria-label={
              has(movie.id)
                ? `Remove ${movie.title} from your watchlist`
                : `Save ${movie.title} to your watchlist`
            }
            className={`btn-icon h-9 w-9 ${has(movie.id) ? 'border-brand-500/60 bg-brand-500/15 text-brand-300' : ''}`}
          >
            <HeartIcon filled={has(movie.id)} className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 hidden text-sm leading-relaxed text-ink-400 line-clamp-2 sm:block">
          {movie.description}
        </p>

        {movie.status === 'NOW_SHOWING' ? (
          <div className="mt-4 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              {dayInfo(day).label}
            </p>
            {showsLoading ? (
              <p className="text-xs text-ink-400">Loading showtimes…</p>
            ) : theaters.length === 0 ? (
              <p className="text-xs text-ink-400">No shows match on this day.</p>
            ) : (
              theaters.map((theater) => (
                <div key={theater.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-ink-300">
                    {theaterShortName(theater.name)}
                  </span>
                  {todays
                    .filter((show) => show.theater.id === theater.id)
                    .map((show) => (
                      <ShowtimeButton
                        key={show.id}
                        show={show}
                        now={now}
                        size="sm"
                        onSelect={() => router.push(showHref(show.id))}
                      />
                    ))}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState({
  query,
  savedCount,
  onReset,
  onChange,
}: {
  query: CatalogQuery;
  savedCount: number;
  onReset: () => void;
  onChange: (patch: Partial<CatalogQuery>) => void;
}) {
  const savedEmpty = query.saved && savedCount === 0;
  return (
    <div className="card flex flex-col items-center rounded-3xl px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-ink-300">
        {savedEmpty ? <HeartIcon className="h-6 w-6" /> : <SearchIcon className="h-6 w-6" />}
      </span>
      <h2 className="mt-5 font-display text-2xl font-semibold text-ink-50">
        {savedEmpty ? 'Your watchlist is empty' : 'No movies match'}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400">
        {savedEmpty
          ? 'Tap the heart on any movie to save it here — handy for the ones you are not ready to book yet.'
          : query.tab === 'now' && !query.saved
            ? 'Nothing in cinemas matches these filters. It might be coming soon — or loosen a filter or two.'
            : 'Try a different spelling, or loosen a filter or two.'}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {query.tab === 'now' && !savedEmpty ? (
          <button type="button" onClick={() => onChange({ tab: 'all' })} className="btn-ghost">
            Search all movies
          </button>
        ) : null}
        <button type="button" onClick={onReset} className="btn-primary">
          {savedEmpty ? 'Browse movies' : 'Reset search & filters'}
        </button>
      </div>
    </div>
  );
}
