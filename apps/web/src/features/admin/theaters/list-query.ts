import {
  AdminScheduleFilter,
  AdminTheaterSort,
  ShowFormat,
  SortOrder,
  defaultTheaterSortOrder,
} from '@cineseat/shared';
import type { AdminTheaterParams } from '../../../lib/api';
import { PAGE_SIZES } from '../ui/list-kit';

/**
 * What the theaters list shows, kept in the URL (`/admin/theaters?city=Dhaka&sort=revenue`)
 * so a view can be bookmarked, shared and restored with Back.
 */
export type TheatersQuery = {
  q: string;
  /** The city tab; null: all cities. */
  city: string | null;
  amenities: string[];
  formats: ShowFormat[];
  schedule: AdminScheduleFilter | null;
  sort: AdminTheaterSort;
  order: SortOrder | null;
  page: number;
  size: number;
};

export const DEFAULT_QUERY: TheatersQuery = {
  q: '',
  city: null,
  amenities: [],
  formats: [],
  schedule: null,
  sort: 'city',
  order: null,
  page: 1,
  size: 20,
};

export const SORT_LABEL: Record<AdminTheaterSort, string> = {
  city: 'City',
  name: 'Name',
  screens: 'Screens',
  seats: 'Seats',
  shows: 'Upcoming shows',
  tickets: 'Tickets sold',
  revenue: 'Revenue',
  occupancy: 'Occupancy ahead',
};

export function orderLabel(sort: AdminTheaterSort, order: SortOrder): string {
  if (sort === 'city' || sort === 'name') return order === 'asc' ? 'A → Z' : 'Z → A';
  return order === 'desc' ? 'Highest first' : 'Lowest first';
}

export type FilterPatch = Pick<TheatersQuery, 'amenities' | 'formats' | 'schedule'>;
export const NO_FILTERS: FilterPatch = { amenities: [], formats: [], schedule: null };

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

/** Malformed values are dropped, so a hand-edited URL never breaks the page. */
export function parseQuery(params: URLSearchParams): TheatersQuery {
  const size = Number(params.get('size'));
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    city: (params.get('city') ?? '').trim().slice(0, 60) || null,
    amenities: list(params.get('amenity')),
    formats: list(params.get('format')).filter((item): item is ShowFormat =>
      (ShowFormat.options as readonly string[]).includes(item),
    ),
    schedule: oneOf(params.get('schedule'), AdminScheduleFilter.options),
    sort: oneOf(params.get('sort'), AdminTheaterSort.options) ?? DEFAULT_QUERY.sort,
    order: oneOf(params.get('order'), SortOrder.options),
    page: Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** Only non-default values are written, which keeps links short. */
export function toSearchParams(query: TheatersQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.city) params.set('city', query.city);
  if (query.amenities.length) params.set('amenity', query.amenities.join(','));
  if (query.formats.length) params.set('format', query.formats.join(','));
  if (query.schedule) params.set('schedule', query.schedule);
  if (query.sort !== DEFAULT_QUERY.sort) params.set('sort', query.sort);
  if (query.order && query.order !== defaultTheaterSortOrder(query.sort))
    params.set('order', query.order);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.size !== DEFAULT_QUERY.size) params.set('size', String(query.size));
  return params;
}

export const effectiveOrder = (query: Pick<TheatersQuery, 'sort' | 'order'>): SortOrder =>
  query.order ?? defaultTheaterSortOrder(query.sort);

export function toApiParams(query: TheatersQuery): AdminTheaterParams {
  return {
    search: query.q.trim() || undefined,
    city: query.city ? [query.city] : [],
    amenity: query.amenities,
    format: query.formats,
    schedule: query.schedule ?? undefined,
    sort: query.sort,
    order: effectiveOrder(query),
    page: query.page,
    pageSize: query.size,
  };
}

export const activeFilterCount = (query: TheatersQuery) =>
  query.amenities.length + query.formats.length + (query.schedule ? 1 : 0);

/** Amenities offered as suggestions (plus any the cinemas already list). */
export const COMMON_AMENITIES = [
  'Recliner row',
  '3D',
  'Dolby Atmos',
  'Food court',
  'Parking',
  'Wheelchair access',
  'Baby care room',
  'Prayer room',
];
