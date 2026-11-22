import { Certificate, MovieSort, ShowFormat } from '@cineseat/shared';
import type { MovieParams } from '../../lib/api';

/**
 * Everything the movies page can be asked for, kept in the URL so a filtered
 * view can be bookmarked, shared and restored with the back button. The API does
 * the filtering: `toApiParams` turns this into GET /movies and /catalog/facets
 * parameters (see DESIGN.md for the mapping).
 */
export type Tab = 'now' | 'soon' | 'all';
export type Sort = MovieSort;
export type View = 'grid' | 'list';
export type RuntimeBand = 'short' | 'medium' | 'long';

export type CatalogQuery = {
  q: string;
  tab: Tab;
  genres: string[];
  languages: string[];
  formats: ShowFormat[];
  certificates: Certificate[];
  city: string | null;
  /** Theater ids. */
  cinemas: string[];
  /** Show date, `YYYY-MM-DD` on the cinemas' clock — a real date, so shared links keep their meaning. */
  date: string | null;
  minRating: number | null;
  runtime: RuntimeBand | null;
  /** Only titles on the visitor's watchlist (kept in the browser until the wishlist API exists). */
  saved: boolean;
  sort: Sort;
  view: View;
};

export const DEFAULT_QUERY: CatalogQuery = {
  q: '',
  tab: 'now',
  genres: [],
  languages: [],
  formats: [],
  certificates: [],
  city: null,
  cinemas: [],
  date: null,
  minRating: null,
  runtime: null,
  saved: false,
  sort: 'popular',
  view: 'grid',
};

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'popular', label: 'Popularity' },
  { value: 'rating', label: 'Top rated' },
  { value: 'release', label: 'Release date' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'runtime', label: 'Shortest first' },
];

export const RUNTIME_BANDS: {
  value: RuntimeBand;
  label: string;
  minDuration?: number;
  maxDuration?: number;
}[] = [
  { value: 'short', label: 'Under 2h', maxDuration: 119 },
  { value: 'medium', label: '2h – 2h 20m', minDuration: 120, maxDuration: 140 },
  { value: 'long', label: 'Over 2h 20m', minDuration: 141 },
];

export const RATING_STEPS = [4.5, 4] as const;

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

/**
 * Malformed values are dropped, so a hand-edited URL can never break the page.
 * Open-ended values (genres, languages, cities, theater ids) are passed through:
 * the API validates them and an unknown one simply matches nothing.
 */
export function parseQuery(params: URLSearchParams): CatalogQuery {
  const rating = Number(params.get('rating'));
  const date = params.get('date');
  return {
    q: text(params.get('q'), 80),
    tab: oneOf(params.get('tab'), ['now', 'soon', 'all'] as const) ?? DEFAULT_QUERY.tab,
    genres: list(params.get('genre'), 30),
    languages: list(params.get('lang')),
    formats: someOf(params.get('format'), ShowFormat.options),
    certificates: someOf(params.get('cert'), Certificate.options),
    city: text(params.get('city'), 60) || null,
    cinemas: list(params.get('cinema'), 64),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    minRating: (RATING_STEPS as readonly number[]).includes(rating) ? rating : null,
    runtime: oneOf(
      params.get('runtime'),
      RUNTIME_BANDS.map((band) => band.value),
    ),
    saved: params.get('saved') === '1',
    sort: oneOf(params.get('sort'), MovieSort.options) ?? DEFAULT_QUERY.sort,
    view: oneOf(params.get('view'), ['grid', 'list'] as const) ?? DEFAULT_QUERY.view,
  };
}

/** Only non-default values are written, which keeps shared links short. */
export function toSearchParams(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.tab !== DEFAULT_QUERY.tab) params.set('tab', query.tab);
  if (query.genres.length) params.set('genre', query.genres.join(','));
  if (query.languages.length) params.set('lang', query.languages.join(','));
  if (query.formats.length) params.set('format', query.formats.join(','));
  if (query.certificates.length) params.set('cert', query.certificates.join(','));
  if (query.city) params.set('city', query.city);
  if (query.cinemas.length) params.set('cinema', query.cinemas.join(','));
  if (query.date) params.set('date', query.date);
  if (query.minRating !== null) params.set('rating', String(query.minRating));
  if (query.runtime) params.set('runtime', query.runtime);
  if (query.saved) params.set('saved', '1');
  if (query.sort !== DEFAULT_QUERY.sort) params.set('sort', query.sort);
  if (query.view !== DEFAULT_QUERY.view) params.set('view', query.view);
  return params;
}

/** GET /movies and /catalog/facets parameters for this view (`saved` is applied in the browser). */
export function toApiParams(query: CatalogQuery): MovieParams {
  const band = RUNTIME_BANDS.find((item) => item.value === query.runtime);
  const shows = query.tab !== 'soon';
  return {
    search: query.q.trim() || undefined,
    status: query.tab === 'now' ? 'NOW_SHOWING' : query.tab === 'soon' ? 'COMING_SOON' : undefined,
    genre: query.genres,
    language: query.languages,
    certificate: query.certificates,
    // Where/when/format rest on "Coming soon" (the API ignores them there too).
    format: shows ? query.formats : [],
    city: shows ? query.city : null,
    theater: shows ? query.cinemas : [],
    date: shows ? query.date : null,
    minRating: query.tab === 'soon' ? null : query.minRating,
    minDuration: band?.minDuration,
    maxDuration: band?.maxDuration,
    sort: query.sort,
  };
}

// --- Helpers ------------------------------------------------------------------------

/** Whether a where/when/format filter is in effect (they rest on "Coming soon"). */
export function hasShowFilters(query: CatalogQuery): boolean {
  if (query.tab === 'soon') return false;
  return (
    query.city !== null ||
    query.cinemas.length > 0 ||
    query.date !== null ||
    query.formats.length > 0
  );
}

/** Number of filters in effect (search, tab, sort and view are not filters). */
export function activeFilterCount(query: CatalogQuery): number {
  const shows = query.tab !== 'soon';
  return (
    query.genres.length +
    query.languages.length +
    query.certificates.length +
    (shows
      ? query.formats.length +
        query.cinemas.length +
        (query.city ? 1 : 0) +
        (query.date !== null ? 1 : 0)
      : 0) +
    (query.minRating !== null && query.tab !== 'soon' ? 1 : 0) +
    (query.runtime ? 1 : 0) +
    (query.saved ? 1 : 0)
  );
}

export function clearFilters(query: CatalogQuery): CatalogQuery {
  return { ...DEFAULT_QUERY, q: query.q, tab: query.tab, sort: query.sort, view: query.view };
}
