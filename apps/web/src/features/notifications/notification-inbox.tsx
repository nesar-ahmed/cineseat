'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BellIcon, CloseIcon } from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { useNow } from '../../hooks/use-now';
import { useAuth } from '../auth/auth-provider';
import { FilterBar, FilterPill, Pagination, pageParam } from '../account/list-controls';
import { NotificationCard } from './notification-card';
import {
  countCategories,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotification,
  useNotificationCounts,
  useNotificationList,
  type InboxView,
  type NotificationScope,
} from './queries';
import { DAY_GROUPS, dayGroup } from './time';
import type { AppNotification } from './types';

/** How long "Undo" stays on screen after a notification is removed. */
const UNDO_MS = 6000;

/** What an inbox's header needs: how many are unread, and "mark all as read". */
export type InboxHeaderState = {
  unread: number | undefined;
  markAllRead: () => void;
  markingAll: boolean;
};

type Props = {
  scope: NotificationScope;
  /** The filters, first one the default (`?view=` names the others). */
  views: InboxView[];
  /** The page's own path, for filter and page links. */
  baseHref: string;
  /** The page's header — each panel has its own look. */
  header: (state: InboxHeaderState) => ReactNode;
  /** The empty state's line under "No notifications yet". */
  emptyHint: string;
};

/**
 * A full notification inbox — the user panel's and the admin panel's: filter
 * pills with counts, every message as a card grouped by day, read/unread, remove
 * with undo, and numbered pages. View and page live in the URL (`?view=&page=`);
 * the API filters and pages.
 */
export function NotificationInbox({ scope, views, baseHref, header, emptyHint }: Props) {
  const params = useSearchParams();
  const view = views.find((candidate) => candidate.id === params.get('view')) ?? views[0];
  const page = pageParam(params.get('page'));
  const hydrated = useHydrated();
  const { user, status } = useAuth();
  const userId = user?.id;

  const counts = useNotificationCounts(userId);
  const markAll = useMarkAllNotificationsRead(userId, scope);
  const hrefFor = (target: InboxView, targetPage: number) => {
    const query = new URLSearchParams();
    if (target !== views[0]) query.set('view', target.id);
    if (targetPage > 1) query.set('page', String(targetPage));
    const qs = query.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {header({
        unread: counts.data ? countCategories(scope.categories, 'unread')(counts.data) : undefined,
        markAllRead: () => markAll.mutate(),
        markingAll: markAll.isPending,
      })}

      {!hydrated || status === 'loading' ? (
        <ListSkeleton />
      ) : !userId ? (
        <div className="card rounded-3xl p-8 text-center">
          <p className="font-display text-xl text-ink-50">Your session has ended</p>
          <Link
            href={`/login?next=${encodeURIComponent(hrefFor(view, page))}`}
            className="btn-primary mt-6"
          >
            Sign in again
          </Link>
        </div>
      ) : (
        <>
          <FilterBar label="Filter notifications">
            {views.map((candidate) => (
              <FilterPill
                key={candidate.id}
                href={hrefFor(candidate, 1)}
                label={candidate.label}
                count={counts.data ? candidate.count(counts.data) : undefined}
                active={candidate === view}
              />
            ))}
          </FilterBar>
          <NotificationList
            userId={userId}
            scope={scope}
            view={view}
            page={page}
            isDefault={view === views[0]}
            emptyHint={emptyHint}
            hrefFor={(targetPage) => hrefFor(view, targetPage)}
            firstHref={hrefFor(views[0], 1)}
          />
        </>
      )}
    </div>
  );
}

function NotificationList({
  userId,
  scope,
  view,
  page,
  isDefault,
  emptyHint,
  hrefFor,
  firstHref,
}: {
  userId: string;
  scope: NotificationScope;
  view: InboxView;
  page: number;
  isDefault: boolean;
  emptyHint: string;
  hrefFor: (page: number) => string;
  firstHref: string;
}) {
  const query = useNotificationList(userId, scope, view, page);
  const mark = useMarkNotification(userId);
  const removal = usePendingRemoval(userId);
  const now = useNow(60_000);

  if (query.isPending || now === null) return <ListSkeleton />;
  if (query.isError) {
    return (
      <div className="card rounded-3xl p-8 text-center">
        <p className="font-display text-xl text-ink-50">Couldn’t load your notifications</p>
        <p className="mt-2 text-sm text-ink-400">{query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    );
  }

  const { items, total, pageSize } = query.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const shown = items.filter((n) => !removal.hidden.has(n.id));

  return (
    <>
      {total === 0 || (shown.length === 0 && page === 1) ? (
        <EmptyState view={view} isDefault={isDefault} hint={emptyHint} firstHref={firstHref} />
      ) : shown.length === 0 ? (
        <div className="card rounded-3xl p-8 text-center">
          <p className="font-display text-xl text-ink-50">Nothing on page {page}</p>
          <Link href={hrefFor(1)} className="btn-primary mt-6">
            Go to the first page
          </Link>
        </div>
      ) : (
        <div
          aria-busy={query.isPlaceholderData}
          className={`flex flex-col gap-8 transition-opacity motion-reduce:transition-none ${
            query.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {DAY_GROUPS.map((group) => {
            const inGroup = shown.filter((n) => dayGroup(n.createdAt, now) === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`group-${group}`}>
                <h2
                  id={`group-${group}`}
                  className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
                >
                  {group}
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {inGroup.map((n) => (
                    <li key={n.id}>
                      <NotificationCard
                        notification={n}
                        now={now}
                        onRead={() => {
                          if (!n.readAt) mark.mutate({ notification: n, read: true });
                        }}
                        onUnread={() => mark.mutate({ notification: n, read: false })}
                        onRemove={() => removal.remove(n)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {pages > 1 ? <Pagination page={page} pages={pages} hrefFor={hrefFor} /> : null}
        </div>
      )}
      <UndoToast removal={removal} />
    </>
  );
}

type PendingRemoval = {
  /** Hidden now; deleted once "Undo" has passed. */
  hidden: ReadonlySet<string>;
  pending: AppNotification | null;
  error: string | null;
  remove: (n: AppNotification) => void;
  undo: () => void;
  /** Deletes the pending one right away (toast dismissed). */
  commit: () => void;
};

/**
 * Removal with Undo. The card disappears at once; the API is only asked to
 * delete it when the Undo window closes, the toast is dismissed, another card is
 * removed, or the page is left — so "Undo" never has to re-create anything.
 */
function usePendingRemoval(userId: string): PendingRemoval {
  const remove = useDeleteNotification(userId);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<AppNotification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<AppNotification | null>(null);
  // The latest `mutate`, for callbacks and for the clean-up when the page is left.
  const mutateRef = useRef(remove.mutate);
  useEffect(() => {
    mutateRef.current = remove.mutate;
  }, [remove.mutate]);

  const unhide = useCallback((id: string) => {
    setHidden((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const deleteNow = useCallback(
    (n: AppNotification) => {
      mutateRef.current(n.id, {
        onError: (failure) => {
          unhide(n.id);
          setError(`Couldn’t remove “${n.title}”: ${failure.message}`);
        },
      });
    },
    [unhide],
  );

  const settle = useCallback((next: AppNotification | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const commit = useCallback(() => {
    const current = pendingRef.current;
    if (current) deleteNow(current);
    settle(null);
  }, [deleteNow, settle]);

  // The Undo window closes by itself.
  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(commit, UNDO_MS);
    return () => window.clearTimeout(id);
  }, [pending, commit]);

  // A failure message closes by itself too.
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), UNDO_MS);
    return () => window.clearTimeout(id);
  }, [error]);

  // Leaving the page keeps the removal.
  useEffect(
    () => () => {
      if (pendingRef.current) mutateRef.current(pendingRef.current.id);
    },
    [],
  );

  return {
    hidden,
    pending,
    error,
    remove: (n) => {
      if (pendingRef.current) deleteNow(pendingRef.current);
      setError(null);
      setHidden((current) => new Set(current).add(n.id));
      settle(n);
    },
    undo: () => {
      const current = pendingRef.current;
      if (current) unhide(current.id);
      settle(null);
    },
    commit,
  };
}

function UndoToast({ removal }: { removal: PendingRemoval }) {
  const undoButton = useRef<HTMLButtonElement>(null);
  const { pending, error } = removal;

  useEffect(() => {
    if (pending) undoButton.current?.focus();
  }, [pending]);

  if (!pending && !error) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/[0.97] py-2.5 pl-4 pr-2 text-sm text-ink-100 shadow-lift motion-reduce:animate-none"
      >
        {pending ? (
          <>
            <span className="min-w-0 truncate">Removed “{pending.title}”</span>
            <button
              ref={undoButton}
              type="button"
              onClick={removal.undo}
              className="shrink-0 rounded-full px-3 py-1.5 font-semibold text-brand-300 hover:bg-white/[0.06] hover:text-brand-200"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={removal.commit}
              aria-label="Dismiss"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="py-1.5 pr-2 text-brand-200">{error}</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  view,
  isDefault,
  hint,
  firstHref,
}: {
  view: InboxView;
  isDefault: boolean;
  hint: string;
  firstHref: string;
}) {
  return (
    <div className="card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-ink-200 ring-1 ring-white/15">
        <BellIcon className="h-7 w-7" />
      </span>
      <p className="mt-5 font-display text-2xl text-ink-50">{view.empty}</p>
      <p className="mt-2 max-w-sm text-sm text-ink-400">
        {isDefault ? hint : 'Nothing here right now.'}
      </p>
      {!isDefault ? (
        <Link href={firstHref} className="btn-ghost mt-6">
          Show all notifications
        </Link>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Loading notifications</span>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
        >
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-white/[0.06] motion-reduce:animate-none" />
          <span className="flex flex-1 flex-col gap-2.5">
            <span className="h-3 w-40 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
            <span className="h-4 w-64 max-w-full animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
            <span className="h-3 w-full animate-pulse rounded-full bg-white/[0.04] motion-reduce:animate-none" />
          </span>
        </div>
      ))}
    </div>
  );
}
