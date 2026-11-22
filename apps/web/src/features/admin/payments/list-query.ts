import { AdminPaymentSort, PaymentChannel, PaymentStatus, type SortOrder } from '@cineseat/shared';
import type { AdminPaymentParams } from '../../../lib/api';
import { PAGE_SIZES } from '../ui/list-kit';

/**
 * What the payments list shows, kept in the URL
 * (`/admin/payments?status=FAILED&channel=BKASH&user=…`) so a view can be
 * bookmarked, shared and restored with Back — and so a buyer's page can link to
 * "their payments". Amounts in the URL are whole taka, as an admin types them.
 */
export type StatusTab = 'all' | PaymentStatus;

export type PaymentsQuery = {
  q: string;
  tab: StatusTab;
  channels: PaymentChannel[];
  users: string[];
  from: string | null;
  to: string | null;
  /** Whole taka. */
  min: number | null;
  max: number | null;
  sort: AdminPaymentSort;
  order: SortOrder | null;
  page: number;
  size: number;
};

export const DEFAULT_QUERY: PaymentsQuery = {
  q: '',
  tab: 'all',
  channels: [],
  users: [],
  from: null,
  to: null,
  min: null,
  max: null,
  sort: 'created',
  order: null,
  page: 1,
  size: 20,
};

export const SORT_LABEL: Record<AdminPaymentSort, string> = {
  created: 'Started',
  completed: 'Settled',
  amount: 'Amount',
};

/** Every sort starts with the newest or largest. */
export const naturalOrder = (): SortOrder => 'desc';

export function orderLabel(sort: AdminPaymentSort, order: SortOrder): string {
  if (sort === 'amount') return order === 'desc' ? 'Largest first' : 'Smallest first';
  return order === 'desc' ? 'Latest first' : 'Earliest first';
}

export type FilterPatch = Pick<PaymentsQuery, 'channels' | 'users' | 'from' | 'to' | 'min' | 'max'>;
export const NO_FILTERS: FilterPatch = {
  channels: [],
  users: [],
  from: null,
  to: null,
  min: null,
  max: null,
};

const list = (value: string | null) =>
  value
    ? Array.from(
        new Set(
          value
            .split(',')
            .map((item) => item.trim().slice(0, 64))
            .filter(Boolean),
        ),
      ).slice(0, 20)
    : [];
const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
const day = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const taka = (value: string | null) => {
  if (value === null || !/^\d{1,7}$/.test(value.trim())) return null;
  return Number(value.trim());
};
const ordered = <T extends string | number>(from: T | null, to: T | null) =>
  from !== null && to !== null && from > to ? [to, from] : [from, to];

/** Malformed values are dropped, so a hand-edited URL never breaks the page. */
export function parseQuery(params: URLSearchParams): PaymentsQuery {
  const size = Number(params.get('size'));
  const [from, to] = ordered(day(params.get('from')), day(params.get('to')));
  const [min, max] = ordered(taka(params.get('min')), taka(params.get('max')));
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    tab: oneOf(params.get('status'), PaymentStatus.options) ?? 'all',
    channels: list(params.get('channel')).filter((item): item is PaymentChannel =>
      (PaymentChannel.options as readonly string[]).includes(item),
    ),
    users: list(params.get('user')),
    from,
    to,
    min,
    max,
    sort: oneOf(params.get('sort'), AdminPaymentSort.options) ?? DEFAULT_QUERY.sort,
    order: oneOf(params.get('order'), ['asc', 'desc'] as const),
    page: Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_QUERY.size,
  };
}

/** Only non-default values are written, which keeps links short. */
export function toSearchParams(query: PaymentsQuery): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | null | readonly string[]) => {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else if (value) params.set(key, value as string);
  };
  put('q', query.q.trim());
  if (query.tab !== 'all') put('status', query.tab);
  put('channel', query.channels);
  put('user', query.users);
  put('from', query.from);
  put('to', query.to);
  if (query.min !== null) put('min', String(query.min));
  if (query.max !== null) put('max', String(query.max));
  if (query.sort !== DEFAULT_QUERY.sort) put('sort', query.sort);
  if (query.order && query.order !== naturalOrder()) put('order', query.order);
  if (query.page > 1) put('page', String(query.page));
  if (query.size !== DEFAULT_QUERY.size) put('size', String(query.size));
  return params;
}

export const effectiveOrder = (query: Pick<PaymentsQuery, 'order'>): SortOrder =>
  query.order ?? naturalOrder();

export function toApiParams(query: PaymentsQuery): AdminPaymentParams {
  return {
    search: query.q.trim() || undefined,
    status: query.tab === 'all' ? [] : [query.tab],
    channel: query.channels,
    user: query.users,
    from: query.from ?? undefined,
    to: query.to ?? undefined,
    minAmount: query.min !== null ? query.min * 100 : undefined,
    maxAmount: query.max !== null ? query.max * 100 : undefined,
    sort: query.sort,
    order: effectiveOrder(query),
    page: query.page,
    pageSize: query.size,
  };
}

export const activeFilterCount = (query: PaymentsQuery) =>
  query.channels.length +
  query.users.length +
  (query.from || query.to ? 1 : 0) +
  (query.min !== null || query.max !== null ? 1 : 0);
