'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellIcon, CheckIcon, ChevronRightIcon } from '../../components/ui/icons';
import { useNow } from '../../hooks/use-now';
import { ACCOUNT_ROUTES } from '../account/links';
import { KINDS, TONE_TILE } from './kinds';
import {
  USER_SCOPE,
  useLatestNotifications,
  useMarkAllNotificationsRead,
  useMarkNotification,
  useUnreadNotificationCount,
  type NotificationScope,
} from './queries';
import { exactTime, relativeTime } from './time';
import type { AppNotification } from './types';

type Props = {
  userId: string;
  /** Which notifications it counts and lists (the user panel's by default). */
  scope?: NotificationScope;
  /** The full inbox ("See all notifications"), also where items without an action go. */
  allHref?: string;
  /** The button's name, before the unread count. */
  label?: string;
  /** The empty panel's second line. */
  emptyText?: string;
};

/**
 * A notification bell (signed-in accounts only): an unread badge that keeps
 * itself fresh, and a panel with the newest notifications. Opening one marks it
 * read and follows its action; everything else is one click away on the full
 * page. The site header shows the user panel's; the admin top bar the admin's.
 *
 * The panel is positioned against the header's session area (the nearest
 * positioned ancestor), so on phones it spans the width instead of hanging off
 * the left edge.
 */
export function NotificationBell({
  userId,
  scope = USER_SCOPE,
  allHref = ACCOUNT_ROUTES.notifications,
  label: name = 'Notifications',
  emptyText = 'Booking updates, reminders and offers show up here.',
}: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const headingId = useId();

  const unread = useUnreadNotificationCount(userId, scope).data?.unread ?? 0;
  const latest = useLatestNotifications(userId, scope, open);
  const mark = useMarkNotification(userId);
  const markAll = useMarkAllNotificationsRead(userId, scope);
  const now = useNow(60_000);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A new page closes the panel.
  useEffect(() => setOpen(false), [pathname]);

  const badge = unread > 9 ? '9+' : String(unread);
  const label = unread > 0 ? `${name}, ${unread} unread` : name;

  const openNotification = (n: AppNotification) => {
    if (!n.readAt) mark.mutate({ notification: n, read: true });
    setOpen(false);
  };

  return (
    <div ref={root}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={name}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border text-ink-100 transition motion-reduce:transition-none ${
          open
            ? 'border-white/25 bg-white/[0.08]'
            : 'border-white/10 bg-white/[0.04] hover:border-white/20'
        }`}
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-ink-950"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        // Solid, not frosted — same reason as the account menu (the header is the backdrop root).
        <section
          id={panelId}
          aria-labelledby={headingId}
          className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2.5rem))] animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-lift motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div>
              <h2 id={headingId} className="text-sm font-semibold text-ink-50">
                Notifications
              </h2>
              <p className="text-xs text-ink-400">
                {unread > 0 ? `${unread} unread` : 'You’re all caught up'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-300 transition hover:bg-white/[0.06] hover:text-brand-200 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[min(26rem,calc(100vh-10rem))] overflow-y-auto overscroll-contain">
            {latest.isPending ? (
              <PreviewSkeleton />
            ) : latest.isError ? (
              <div className="px-4 py-8 text-center text-sm text-ink-400">
                <p>Couldn’t load your notifications.</p>
                <button
                  type="button"
                  onClick={() => void latest.refetch()}
                  className="mt-3 font-semibold text-brand-300 hover:text-brand-200"
                >
                  Try again
                </button>
              </div>
            ) : latest.data.items.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-ink-300 ring-1 ring-white/10">
                  <BellIcon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink-100">No notifications yet</p>
                <p className="mt-1 text-xs text-ink-400">{emptyText}</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {latest.data.items.map((n) => (
                  <li key={n.id}>
                    <PreviewItem
                      notification={n}
                      now={now ?? Date.now()}
                      fallbackHref={allHref}
                      onOpen={() => openNotification(n)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href={allHref}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 border-t border-white/[0.06] px-4 py-3 text-sm font-semibold text-ink-100 transition hover:bg-white/[0.04] motion-reduce:transition-none"
          >
            See all notifications
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}

/** One row: kind, title, a line of the message, when — the whole row opens it. */
function PreviewItem({
  notification: n,
  now,
  fallbackHref,
  onOpen,
}: {
  notification: AppNotification;
  now: number;
  /** Where an item without an action of its own goes: the full inbox. */
  fallbackHref: string;
  onOpen: () => void;
}) {
  const kind = KINDS[n.type];
  const Icon = kind.icon;
  const unread = !n.readAt;
  const href = kind.action?.(n).href ?? fallbackHref;

  return (
    <Link
      href={href}
      onClick={onOpen}
      className={`flex gap-3 px-4 py-3 transition hover:bg-white/[0.04] motion-reduce:transition-none ${
        unread ? 'bg-white/[0.025]' : ''
      }`}
    >
      <span
        className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${TONE_TILE[kind.tone]} ${unread ? '' : 'opacity-70'}`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${unread ? 'font-semibold text-ink-50' : 'font-medium text-ink-200'}`}
        >
          {unread ? <span className="sr-only">Unread: </span> : null}
          {n.title}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-400">{n.body}</span>
        <time
          dateTime={n.createdAt}
          title={exactTime(n.createdAt)}
          className="mt-1 block text-[11px] text-ink-500"
        >
          {relativeTime(n.createdAt, now)}
        </time>
      </span>
      {unread ? (
        <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
      ) : null}
    </Link>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      <span className="sr-only">Loading notifications</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="flex gap-3 px-4 py-3">
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-white/[0.06] motion-reduce:animate-none" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 w-40 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
            <span className="h-3 w-full animate-pulse rounded-full bg-white/[0.04] motion-reduce:animate-none" />
          </span>
        </div>
      ))}
    </div>
  );
}
