import {
  AdminMoviePosterFilter,
  AdminMovieScheduleFilter,
  AdminMovieSort,
  Certificate,
  ShowFormat,
  SortOrder,
  defaultSortOrder,
} from '@cineseat/shared';
import type { AdminMovieParams } from '../../../lib/api';
import { PAGE_SIZES } from '../ui/list-kit';

/**
 * What the admin movies list shows, kept in the URL (`/admin/movies?status=soon&sort=revenue`)
 * so a view can be bookmarked, shared and restored with Back. `toApiParams` maps it
 * to GET /admin/movies.
 */
export type StatusTab = 'all' | 'now' | 'soon';

export type MoviesQuery = {
  q: string;
  tab: StatusTab;
  genres: string[];
  languages: string[];
  certificates: Certificate[];
  formats: ShowFormat[];
  schedule: AdminMovieScheduleFilter | null;
  poster: AdminMoviePosterFilter | null;
  /** Release window, `YYYY-MM-DD` on the cinemas' clock. */
  from: string | null;
  to: string | null;
  sort: AdminMovieSort;
  /** null: the sort's natural direction (`defaultSortOrder`). */
  order: SortOrder | null;
  page: number;
  size: number;
};

export const DEFAULT_QUERY: MoviesQuery = {
  q: '',
  tab: 'all',
  genres: [],
  languages: [],
  certificates: [],
  formats: [],
  schedule: null,
  poster: null,
  from: null,
  to: null,
  sort: 'updated',
  order: null,
  page: 1,
  size: 20,
};

export const SORT_LABEL: Record<AdminMovieSort, string> = {
  updated: 'Last updated',
  created: 'Date added',
  title: 'Title',
  release: 'Release date',
  runtime: 'Running time',
  popularity: 'Popularity',
  rating: 'Rating',
  shows: 'Upcoming shows',
  tickets: 'Tickets sold',
  revenue: 'Revenue',
};

/** How each direction reads for a sort ("A → Z", "Newest first"…). */
export function orderLabel(sort: AdminMovieSort, order: SortOrder): string {
  switch (sort) {
    case 'title':
      return order === 'asc' ? 'A → Z' : 'Z → A';
    case 'updated':
    case 'created':
    case 'release':
      return order === 'desc' ? 'Newest first' : 'Oldest first';
    case 'runtime':
      return order === 'desc' ? 'Longest first' : 'Shortest first';
    default:
      return order === 'desc' ? 'Highest first' : 'Lowest first';
  }
}

// --- URL <-> query ----------------------------------------------------------------

const text = (value: string | null, max: number) => (value ?? '').trim().slice(0, max);
const list = (value: string | null, max = 40) =>
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
export function parseQuery(params: URLSearchParams): MoviesQuery {
  const size = Number(params.get('size'));
  let from = day(params.get('from'));
  let to = day(params.get('to'));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: text(params.get('q'), 80),
    tab: oneOf(params.get('status'), ['now', 'soon'] as const) ?? 'all',
    genres: list(params.get('genre'), 30),
    languages: list(params.get('lang')),
    certificates: someOf(params.get('cert'), Certificate.options),
    formats: someOf(params.get('format'), ShowFormat.options),
    schedule: oneOf(params.get('schedule'), AdminMovieScheduleFilter.options),
    poster: oneOf(params.get('poster'), AdminMoviePosterFilter.options),
    from,
    to,
    sort: oneOf(params.get('sort'), AdminMovieSort.options) ?? DEFAULT_QUERY.sort,
    order: oneOf(params.get('order'), SortOrder.options),
    page: Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** Only non-default values are written, which keeps links short. */
export function toSearchParams(query: MoviesQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.tab !== 'all') params.set('status', query.tab);
  if (query.genres.length) params.set('genre', query.genres.join(','));
  if (query.languages.length) params.set('lang', query.languages.join(','));
  if (query.certificates.length) params.set('cert', query.certificates.join(','));
  if (query.formats.length) params.set('format', query.formats.join(','));
  if (query.schedule) params.set('schedule', query.schedule);
  if (query.poster) params.set('poster', query.poster);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.sort !== DEFAULT_QUERY.sort) params.set('sort', query.sort);
  if (query.order && query.order !== defaultSortOrder(query.sort)) params.set('order', query.order);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.size !== DEFAULT_QUERY.size) params.set('size', String(query.size));
  return params;
}

export function toApiParams(query: MoviesQuery): AdminMovieParams {
  return {
    search: query.q.trim() || undefined,
    status: query.tab === 'now' ? 'NOW_SHOWING' : query.tab === 'soon' ? 'COMING_SOON' : undefined,
    genre: query.genres,
    language: query.languages,
    certificate: query.certificates,
    format: query.formats,
    schedule: query.schedule ?? undefined,
    poster: query.poster ?? undefined,
    releasedFrom: query.from ?? undefined,
    releasedTo: query.to ?? undefined,
    sort: query.sort,
    order: effectiveOrder(query),
    page: query.page,
    pageSize: query.size,
  };
}

export const effectiveOrder = (query: Pick<MoviesQuery, 'sort' | 'order'>): SortOrder =>
  query.order ?? defaultSortOrder(query.sort);

/** Filters in effect (search, tab, sort and paging are not filters). */
export function activeFilterCount(query: MoviesQuery): number {
  return (
    query.genres.length +
    query.languages.length +
    query.certificates.length +
    query.formats.length +
    (query.schedule ? 1 : 0) +
    (query.poster ? 1 : 0) +
    (query.from || query.to ? 1 : 0)
  );
}

export type FilterPatch = Pick<
  MoviesQuery,
  'genres' | 'languages' | 'certificates' | 'formats' | 'schedule' | 'poster' | 'from' | 'to'
>;

export const NO_FILTERS: FilterPatch = {
  genres: [],
  languages: [],
  certificates: [],
  formats: [],
  schedule: null,
  poster: null,
  from: null,
  to: null,
};
