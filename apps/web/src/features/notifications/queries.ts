'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  NOTIFICATION_CATEGORY,
  USER_NOTIFICATION_CATEGORIES,
  notificationTypesIn,
  type NotificationCategory,
  type NotificationCounts,
  type Paginated,
  type UnreadCount,
} from '@cineseat/shared';
import {
  deleteNotification,
  getNotificationCounts,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotification,
  type NotificationParams,
} from '../../lib/api';
import type { AppNotification } from './types';

/**
 * Notifications from the API, through one TanStack Query cache, for two panels:
 *
 * - the user panel (`USER_SCOPE`): bookings, offers and account notices;
 * - the admin panel (`ADMIN_SCOPE`): the `admin` category only.
 *
 * Every key starts with `['notifications', userId]`, so one account's inbox is
 * never shown to the next person who signs in on the same browser, and one
 * invalidation refreshes every list, badge and count of both panels.
 */

/** Which notifications a panel shows. */
export type NotificationScope = {
  id: 'user' | 'admin';
  categories: readonly NotificationCategory[];
};
export const USER_SCOPE: NotificationScope = {
  id: 'user',
  categories: USER_NOTIFICATION_CATEGORIES,
};
export const ADMIN_SCOPE: NotificationScope = { id: 'admin', categories: ['admin'] };
const SCOPES = [USER_SCOPE, ADMIN_SCOPE];

/**
 * One filter of an inbox (`?view=`): what to ask the API for, and how many it
 * holds according to GET /notifications/counts.
 */
export type InboxView = {
  id: string;
  label: string;
  /** Heading of the empty state. */
  empty: string;
  params: NotificationParams;
  count: (counts: NotificationCounts) => number;
};

/** Totals (or unread) of some categories, from the counts. */
export const countCategories =
  (categories: readonly NotificationCategory[], field: 'total' | 'unread' = 'total') =>
  (counts: NotificationCounts) =>
    categories.reduce((sum, category) => sum + counts.categories[category][field], 0);

/** Totals of some types, from the counts. */
export const countTypes =
  (types: readonly AppNotification['type'][]) => (counts: NotificationCounts) =>
    types.reduce((sum, type) => sum + (counts.types[type]?.total ?? 0), 0);

/** Notifications per page of an inbox. */
export const NOTIFICATIONS_PAGE_SIZE = 20;
/** How many a bell's panel previews. */
export const BELL_PREVIEW_SIZE = 6;
/** How often an unread badge asks for news while the tab is visible. */
export const UNREAD_POLL_MS = 30_000;

const root = (userId: string) => ['notifications', userId] as const;
export const notificationKeys = {
  root,
  list: (userId: string, scope: NotificationScope, view: string, page: number) =>
    [...root(userId), scope.id, 'list', view, page] as const,
  latest: (userId: string, scope: NotificationScope) =>
    [...root(userId), scope.id, 'latest'] as const,
  unread: (userId: string, scope: NotificationScope) =>
    [...root(userId), scope.id, 'unread'] as const,
  counts: (userId: string) => [...root(userId), 'counts'] as const,
};

/** One page of an inbox view, newest first. */
export function useNotificationList(
  userId: string | undefined,
  scope: NotificationScope,
  view: InboxView,
  page: number,
) {
  return useQuery({
    queryKey: notificationKeys.list(userId ?? '', scope, view.id, page),
    queryFn: () => listNotifications({ ...view.params, page, pageSize: NOTIFICATIONS_PAGE_SIZE }),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** The newest few of a scope, for its bell — asked for only while the panel is open. */
export function useLatestNotifications(
  userId: string | undefined,
  scope: NotificationScope,
  enabled: boolean,
) {
  return useQuery({
    queryKey: notificationKeys.latest(userId ?? '', scope),
    queryFn: () =>
      listNotifications({ category: scope.categories, page: 1, pageSize: BELL_PREVIEW_SIZE }),
    enabled: Boolean(userId) && enabled,
    staleTime: 0,
  });
}

/** Unread count of a scope, for its badge; polled while the tab is visible. */
export function useUnreadNotificationCount(
  userId: string | undefined,
  scope: NotificationScope = USER_SCOPE,
) {
  return useQuery({
    queryKey: notificationKeys.unread(userId ?? '', scope),
    queryFn: () => getUnreadNotificationCount(scope.categories),
    enabled: Boolean(userId),
    refetchInterval: UNREAD_POLL_MS,
    staleTime: 10_000,
  });
}

/** Totals and unread per category and per type, for an inbox's filter pills. */
export function useNotificationCounts(userId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.counts(userId ?? ''),
    queryFn: getNotificationCounts,
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

// --- Changes ------------------------------------------------------------------------

type Snapshot = [QueryKey, unknown][];

/** Every cached answer under the account's root, to put back if a change fails. */
async function snapshot(client: QueryClient, userId: string): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: root(userId) });
  return client.getQueriesData({ queryKey: root(userId) });
}

function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [key, data] of saved ?? []) client.setQueryData(key, data);
}

/** Applies `change` to every cached page of notifications (inboxes and bell previews). */
function patchLists(
  client: QueryClient,
  userId: string,
  change: (n: AppNotification) => AppNotification,
) {
  client.setQueriesData<unknown>({ queryKey: root(userId) }, (data: unknown) => {
    if (!isPage(data)) return data;
    return { ...data, items: data.items.map(change) };
  });
}

const isPage = (data: unknown): data is Paginated<AppNotification> =>
  typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items);

const plus = (value: number, delta: number) => Math.max(0, value + delta);

/** Moves the badges and the counts by `delta` unread of one notification's type. */
function shiftUnread(
  client: QueryClient,
  userId: string,
  type: AppNotification['type'],
  delta: number,
) {
  const category = NOTIFICATION_CATEGORY[type];
  for (const scope of SCOPES) {
    if (!scope.categories.includes(category)) continue;
    client.setQueryData<UnreadCount>(notificationKeys.unread(userId, scope), (data) =>
      data ? { unread: plus(data.unread, delta) } : data,
    );
  }
  client.setQueryData<NotificationCounts>(notificationKeys.counts(userId), (data) =>
    data
      ? {
          ...data,
          unread: plus(data.unread, delta),
          categories: {
            ...data.categories,
            [category]: {
              ...data.categories[category],
              unread: plus(data.categories[category].unread, delta),
            },
          },
          types: {
            ...data.types,
            [type]: { ...data.types[type], unread: plus(data.types[type]?.unread ?? 0, delta) },
          },
        }
      : data,
  );
}

/** Marks one read or unread — shown at once everywhere, undone if the API refuses. */
export function useMarkNotification(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ notification, read }: { notification: AppNotification; read: boolean }) =>
      markNotification(notification.id, read),
    onMutate: async ({ notification, read }) => {
      if (!userId) return undefined;
      const saved = await snapshot(client, userId);
      const readAt = read ? (notification.readAt ?? new Date().toISOString()) : null;
      patchLists(client, userId, (n) => (n.id === notification.id ? { ...n, readAt } : n));
      const wasUnread = notification.readAt === null;
      if (wasUnread === read) shiftUnread(client, userId, notification.type, read ? -1 : 1);
      return saved;
    },
    onError: (_error, _variables, saved) => restore(client, saved),
    onSettled: () => userId && client.invalidateQueries({ queryKey: root(userId) }),
  });
}

/** Marks every unread notification of a scope read. */
export function useMarkAllNotificationsRead(userId: string | undefined, scope: NotificationScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(scope.categories),
    onMutate: async () => {
      if (!userId) return undefined;
      const saved = await snapshot(client, userId);
      const at = new Date().toISOString();
      const inScope = (n: AppNotification) => scope.categories.includes(n.category);
      patchLists(client, userId, (n) => (n.readAt || !inScope(n) ? n : { ...n, readAt: at }));
      client.setQueryData<UnreadCount>(notificationKeys.unread(userId, scope), (data) =>
        data ? { unread: 0 } : data,
      );
      client.setQueryData<NotificationCounts>(notificationKeys.counts(userId), (data) => {
        if (!data) return data;
        const categories = { ...data.categories };
        const types = { ...data.types };
        let cleared = 0;
        for (const category of scope.categories) {
          cleared += categories[category].unread;
          categories[category] = { ...categories[category], unread: 0 };
          for (const type of notificationTypesIn(category)) {
            if (types[type]) types[type] = { ...types[type], unread: 0 };
          }
        }
        return { ...data, unread: plus(data.unread, -cleared), categories, types };
      });
      return saved;
    },
    onError: (_error, _variables, saved) => restore(client, saved),
    onSettled: () => userId && client.invalidateQueries({ queryKey: root(userId) }),
  });
}

/** Removes one for good (inboxes hide it first and only call this once "Undo" has passed). */
export function useDeleteNotification(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSettled: () => userId && client.invalidateQueries({ queryKey: root(userId) }),
  });
}
