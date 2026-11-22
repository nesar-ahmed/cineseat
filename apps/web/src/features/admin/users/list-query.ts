import {
  AdminUserActivity,
  AdminUserSort,
  UserRole,
  defaultUserSortOrder,
  type SortOrder,
} from '@cineseat/shared';
import type { AdminUserParams } from '../../../lib/api';
import { PAGE_SIZES } from '../ui/list-kit';

/**
 * What the users list shows, kept in the URL (`/admin/users?role=ADMIN&sort=spent`)
 * so a view can be bookmarked, shared and restored with Back.
 */
export type RoleTab = 'all' | UserRole;

export type UsersQuery = {
  q: string;
  tab: RoleTab;
  activity: AdminUserActivity | null;
  joinedFrom: string | null;
  joinedTo: string | null;
  sort: AdminUserSort;
  order: SortOrder | null;
  page: number;
  size: number;
};

export const DEFAULT_QUERY: UsersQuery = {
  q: '',
  tab: 'all',
  activity: null,
  joinedFrom: null,
  joinedTo: null,
  sort: 'joined',
  order: null,
  page: 1,
  size: 20,
};

export const SORT_LABEL: Record<AdminUserSort, string> = {
  joined: 'Joined',
  name: 'Name',
  bookings: 'Paid bookings',
  spent: 'Spent',
  lastBooking: 'Last booking',
};

export function orderLabel(sort: AdminUserSort, order: SortOrder): string {
  if (sort === 'name') return order === 'asc' ? 'A to Z' : 'Z to A';
  if (sort === 'joined' || sort === 'lastBooking')
    return order === 'desc' ? 'Latest first' : 'Earliest first';
  return order === 'desc' ? 'Most first' : 'Fewest first';
}

export const ACTIVITY_LABEL: Record<AdminUserActivity, string> = {
  booked: 'Has booked',
  never: 'Never booked',
};

export type FilterPatch = Pick<UsersQuery, 'activity' | 'joinedFrom' | 'joinedTo'>;
export const NO_FILTERS: FilterPatch = { activity: null, joinedFrom: null, joinedTo: null };

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
const day = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/** Malformed values are dropped, so a hand-edited URL never breaks the page. */
export function parseQuery(params: URLSearchParams): UsersQuery {
  const size = Number(params.get('size'));
  let joinedFrom = day(params.get('joined-from'));
  let joinedTo = day(params.get('joined-to'));
  if (joinedFrom && joinedTo && joinedFrom > joinedTo)
    [joinedFrom, joinedTo] = [joinedTo, joinedFrom];
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    tab: oneOf(params.get('role'), UserRole.options) ?? 'all',
    activity: oneOf(params.get('activity'), AdminUserActivity.options),
    joinedFrom,
    joinedTo,
    sort: oneOf(params.get('sort'), AdminUserSort.options) ?? DEFAULT_QUERY.sort,
    order: oneOf(params.get('order'), ['asc', 'desc'] as const),
    page: Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** Only non-default values are written, which keeps links short. */
export function toSearchParams(query: UsersQuery): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | null) => {
    if (value) params.set(key, value);
  };
  put('q', query.q.trim());
  if (query.tab !== 'all') put('role', query.tab);
  put('activity', query.activity);
  put('joined-from', query.joinedFrom);
  put('joined-to', query.joinedTo);
  if (query.sort !== DEFAULT_QUERY.sort) put('sort', query.sort);
  if (query.order && query.order !== defaultUserSortOrder(query.sort)) put('order', query.order);
  if (query.page > 1) put('page', String(query.page));
  if (query.size !== DEFAULT_QUERY.size) put('size', String(query.size));
  return params;
}

export const effectiveOrder = (query: Pick<UsersQuery, 'sort' | 'order'>): SortOrder =>
  query.order ?? defaultUserSortOrder(query.sort);

export function toApiParams(query: UsersQuery): AdminUserParams {
  return {
    search: query.q.trim() || undefined,
    role: query.tab === 'all' ? undefined : query.tab,
    activity: query.activity ?? undefined,
    joinedFrom: query.joinedFrom ?? undefined,
    joinedTo: query.joinedTo ?? undefined,
    sort: query.sort,
    order: effectiveOrder(query),
    page: query.page,
    pageSize: query.size,
  };
}

export const activeFilterCount = (query: UsersQuery) =>
  (query.activity ? 1 : 0) + (query.joinedFrom || query.joinedTo ? 1 : 0);
