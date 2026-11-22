import {
  AdminShowSort,
  AdminShowTicketsFilter,
  AdminShowWhen,
  ShowAvailability,
  ShowFormat,
  SortOrder,
  defaultShowSortOrder,
} from '@cineseat/shared';
import type { AdminShowParams } from '../../../lib/api';
import { PAGE_SIZES } from '../ui/list-kit';

/**
 * What the showtimes page shows, kept in the URL so a view can be bookmarked,
 * shared and restored with Back: `/admin/shows?theater=…&when=past` (the list)
 * or `/admin/shows?view=board&day=2026-11-14` (one day, screen by screen).
 */
export type ShowsView = 'list' | 'board';

export type ShowsQuery = {
  q: string;
  view: ShowsView;
  when: AdminShowWhen;
  /** The board's day (`YYYY-MM-DD`, cinema clock); null: today. */
  day: string | null;
  /** The list's day range (cinema days), on top of `when`. */
  from: string | null;
  to: string | null;
  movies: string[];
  theaters: string[];
  screens: string[];
  cities: string[];
  formats: ShowFormat[];
  languages: string[];
  availability: ShowAvailability[];
  tickets: AdminShowTicketsFilter | null;
  sort: AdminShowSort;
  order: SortOrder | null;
  page: number;
  size: number;
};

export const DEFAULT_QUERY: ShowsQuery = {
  q: '',
  view: 'list',
  when: 'upcoming',
  day: null,
  from: null,
  to: null,
  movies: [],
  theaters: [],
  screens: [],
  cities: [],
  formats: [],
  languages: [],
  availability: [],
  tickets: null,
  sort: 'startsAt',
  order: null,
  page: 1,
  size: 20,
};

export const SORT_LABEL: Record<AdminShowSort, string> = {
  startsAt: 'Show time',
  movie: 'Movie',
  theater: 'Theater',
  sold: 'Seats sold',
  occupancy: 'Occupancy',
  revenue: 'Revenue',
  price: 'Base price',
};

export function orderLabel(sort: AdminShowSort, order: SortOrder): string {
  if (sort === 'startsAt') return order === 'asc' ? 'Earliest first' : 'Latest first';
  if (sort === 'movie' || sort === 'theater') return order === 'asc' ? 'A → Z' : 'Z → A';
  return order === 'desc' ? 'Highest first' : 'Lowest first';
}

export const AVAILABILITY_LABEL: Record<ShowAvailability, string> = {
  AVAILABLE: 'Plenty of seats',
  FILLING: 'Filling up',
  ALMOST_FULL: 'Almost full',
  SOLD_OUT: 'Sold out',
};

export type FilterPatch = Pick<
  ShowsQuery,
  | 'from'
  | 'to'
  | 'movies'
  | 'theaters'
  | 'screens'
  | 'cities'
  | 'formats'
  | 'languages'
  | 'availability'
  | 'tickets'
>;
export const NO_FILTERS: FilterPatch = {
  from: null,
  to: null,
  movies: [],
  theaters: [],
  screens: [],
  cities: [],
  formats: [],
  languages: [],
  availability: [],
  tickets: null,
};

const list = (value: string | null, max = 64) =>
  value
    ? Array.from(
        new Set(
          value
            .split(',')
            .map((item) => item.trim().slice(0, max))
            .filter(Boolean),
        ),
      ).slice(0, 20)
    : [];
const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
const someOf = <T extends string>(value: string | null, allowed: readonly T[]): T[] =>
  list(value).filter((item): item is T => (allowed as readonly string[]).includes(item));
const day = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/** Malformed values are dropped, so a hand-edited URL never breaks the page. */
export function parseQuery(params: URLSearchParams): ShowsQuery {
  const size = Number(params.get('size'));
  let from = day(params.get('from'));
  let to = day(params.get('to'));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    view: oneOf(params.get('view'), ['list', 'board'] as const) ?? 'list',
    when: oneOf(params.get('when'), AdminShowWhen.options) ?? DEFAULT_QUERY.when,
    day: day(params.get('day')),
    from,
    to,
    movies: list(params.get('movie')),
    theaters: list(params.get('theater')),
    screens: list(params.get('screen')),
    cities: list(params.get('city'), 60),
    formats: someOf(params.get('format'), ShowFormat.options),
    languages: list(params.get('lang'), 40),
    availability: someOf(params.get('avail'), ShowAvailability.options),
    tickets: oneOf(params.get('tickets'), AdminShowTicketsFilter.options),
    sort: oneOf(params.get('sort'), AdminShowSort.options) ?? DEFAULT_QUERY.sort,
    order: oneOf(params.get('order'), SortOrder.options),
    page: Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** Only non-default values are written, which keeps links short. */
export function toSearchParams(query: ShowsQuery): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | null | readonly string[]) => {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else if (value) params.set(key, value as string);
  };
  put('q', query.q.trim());
  if (query.view !== 'list') put('view', query.view);
  if (query.when !== DEFAULT_QUERY.when) put('when', query.when);
  put('day', query.day);
  put('from', query.from);
  put('to', query.to);
  put('movie', query.movies);
  put('theater', query.theaters);
  put('screen', query.screens);
  put('city', query.cities);
  put('format', query.formats);
  put('lang', query.languages);
  put('avail', query.availability);
  put('tickets', query.tickets);
  if (query.sort !== DEFAULT_QUERY.sort) put('sort', query.sort);
  if (query.order && query.order !== defaultShowSortOrder(query.sort, query.when))
    put('order', query.order);
  if (query.page > 1) put('page', String(query.page));
  if (query.size !== DEFAULT_QUERY.size) put('size', String(query.size));
  return params;
}

export const effectiveOrder = (query: Pick<ShowsQuery, 'sort' | 'order' | 'when'>): SortOrder =>
  query.order ?? defaultShowSortOrder(query.sort, query.when);

/** The filters both views share (what, where, how full). */
function filterParams(query: ShowsQuery): AdminShowParams {
  return {
    search: query.q.trim() || undefined,
    movie: query.movies,
    theater: query.theaters,
    screen: query.screens,
    city: query.cities,
    format: query.formats,
    language: query.languages,
    availability: query.availability,
    tickets: query.tickets ?? undefined,
  };
}

/** GET /admin/shows for the list: a page of the chosen tab. */
export function toApiParams(query: ShowsQuery): AdminShowParams {
  return {
    ...filterParams(query),
    when: query.when,
    from: query.from ?? undefined,
    to: query.to ?? undefined,
    sort: query.sort,
    order: effectiveOrder(query),
    page: query.page,
    pageSize: query.size,
  };
}

/** GET /admin/shows for the board: every show of one day (a day has far fewer than 100). */
export function toBoardParams(query: ShowsQuery, day: string): AdminShowParams {
  return {
    ...filterParams(query),
    when: 'all',
    from: day,
    to: day,
    sort: 'startsAt',
    pageSize: 100,
  };
}

export function activeFilterCount(query: ShowsQuery): number {
  return (
    (query.from || query.to ? 1 : 0) +
    query.movies.length +
    query.theaters.length +
    query.screens.length +
    query.cities.length +
    query.formats.length +
    query.languages.length +
    query.availability.length +
    (query.tickets ? 1 : 0)
  );
}
