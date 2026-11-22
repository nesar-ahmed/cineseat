import {
  AdminBookingSort,
  BookingStatus,
  PaymentStatus,
  SortOrder,
  defaultBookingSortOrder,
} from '@cineseat/shared';
import type { AdminBookingParams } from '../../../lib/api';
import { PAGE_SIZES } from '../ui/list-kit';

/**
 * What the bookings list shows, kept in the URL (`/admin/bookings?status=FAILED&payment=REFUNDED`)
 * so a view can be bookmarked, shared and restored with Back — and so other
 * pages can link to "this show's bookings" or "this buyer's bookings".
 */
export type StatusTab = 'all' | BookingStatus;

export type BookingsQuery = {
  q: string;
  tab: StatusTab;
  payments: PaymentStatus[];
  movies: string[];
  theaters: string[];
  shows: string[];
  users: string[];
  coupons: string[];
  bookedFrom: string | null;
  bookedTo: string | null;
  showFrom: string | null;
  showTo: string | null;
  sort: AdminBookingSort;
  order: SortOrder | null;
  page: number;
  size: number;
};

export const DEFAULT_QUERY: BookingsQuery = {
  q: '',
  tab: 'all',
  payments: [],
  movies: [],
  theaters: [],
  shows: [],
  users: [],
  coupons: [],
  bookedFrom: null,
  bookedTo: null,
  showFrom: null,
  showTo: null,
  sort: 'created',
  order: null,
  page: 1,
  size: 20,
};

export const SORT_LABEL: Record<AdminBookingSort, string> = {
  created: 'Booked',
  showtime: 'Show time',
  amount: 'Amount',
  seats: 'Seats',
};

export function orderLabel(sort: AdminBookingSort, order: SortOrder): string {
  if (sort === 'created' || sort === 'showtime')
    return order === 'desc' ? 'Latest first' : 'Earliest first';
  return order === 'desc' ? 'Largest first' : 'Smallest first';
}

export type FilterPatch = Pick<
  BookingsQuery,
  | 'payments'
  | 'movies'
  | 'theaters'
  | 'shows'
  | 'users'
  | 'coupons'
  | 'bookedFrom'
  | 'bookedTo'
  | 'showFrom'
  | 'showTo'
>;
export const NO_FILTERS: FilterPatch = {
  payments: [],
  movies: [],
  theaters: [],
  shows: [],
  users: [],
  coupons: [],
  bookedFrom: null,
  bookedTo: null,
  showFrom: null,
  showTo: null,
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
const day = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const ordered = (from: string | null, to: string | null) =>
  from && to && from > to ? [to, from] : [from, to];

/** Malformed values are dropped, so a hand-edited URL never breaks the page. */
export function parseQuery(params: URLSearchParams): BookingsQuery {
  const size = Number(params.get('size'));
  const [bookedFrom, bookedTo] = ordered(
    day(params.get('booked-from')),
    day(params.get('booked-to')),
  );
  const [showFrom, showTo] = ordered(day(params.get('show-from')), day(params.get('show-to')));
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    tab: oneOf(params.get('status'), BookingStatus.options) ?? 'all',
    payments: list(params.get('payment')).filter((item): item is PaymentStatus =>
      (PaymentStatus.options as readonly string[]).includes(item),
    ),
    movies: list(params.get('movie')),
    theaters: list(params.get('theater')),
    shows: list(params.get('show')),
    users: list(params.get('user')),
    coupons: list(params.get('coupon'), 32).map((code) => code.toUpperCase()),
    bookedFrom,
    bookedTo,
    showFrom,
    showTo,
    sort: oneOf(params.get('sort'), AdminBookingSort.options) ?? DEFAULT_QUERY.sort,
    order: oneOf(params.get('order'), SortOrder.options),
    page: Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** Only non-default values are written, which keeps links short. */
export function toSearchParams(query: BookingsQuery): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | null | readonly string[]) => {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else if (value) params.set(key, value as string);
  };
  put('q', query.q.trim());
  if (query.tab !== 'all') put('status', query.tab);
  put('payment', query.payments);
  put('movie', query.movies);
  put('theater', query.theaters);
  put('show', query.shows);
  put('user', query.users);
  put('coupon', query.coupons);
  put('booked-from', query.bookedFrom);
  put('booked-to', query.bookedTo);
  put('show-from', query.showFrom);
  put('show-to', query.showTo);
  if (query.sort !== DEFAULT_QUERY.sort) put('sort', query.sort);
  if (query.order && query.order !== defaultBookingSortOrder(query.sort)) put('order', query.order);
  if (query.page > 1) put('page', String(query.page));
  if (query.size !== DEFAULT_QUERY.size) put('size', String(query.size));
  return params;
}

export const effectiveOrder = (query: Pick<BookingsQuery, 'sort' | 'order'>): SortOrder =>
  query.order ?? defaultBookingSortOrder(query.sort);

export function toApiParams(query: BookingsQuery): AdminBookingParams {
  return {
    search: query.q.trim() || undefined,
    status: query.tab === 'all' ? [] : [query.tab],
    payment: query.payments,
    movie: query.movies,
    theater: query.theaters,
    show: query.shows,
    user: query.users,
    coupon: query.coupons,
    bookedFrom: query.bookedFrom ?? undefined,
    bookedTo: query.bookedTo ?? undefined,
    showFrom: query.showFrom ?? undefined,
    showTo: query.showTo ?? undefined,
    sort: query.sort,
    order: effectiveOrder(query),
    page: query.page,
    pageSize: query.size,
  };
}

export const activeFilterCount = (query: BookingsQuery) =>
  query.payments.length +
  query.movies.length +
  query.theaters.length +
  query.shows.length +
  query.users.length +
  query.coupons.length +
  (query.bookedFrom || query.bookedTo ? 1 : 0) +
  (query.showFrom || query.showTo ? 1 : 0);
