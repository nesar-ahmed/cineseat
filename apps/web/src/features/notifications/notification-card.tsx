'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckIcon, ChevronRightIcon, CopyIcon, TrashIcon } from '../../components/ui/icons';
import { KINDS, TONE_LABEL, TONE_TILE } from './kinds';
import { exactTime, relativeTime } from './time';
import type { AppNotification } from './types';

type Props = {
  notification: AppNotification;
  now: number;
  onRead: () => void;
  onUnread: () => void;
  onRemove: () => void;
};

/**
 * One notification: what kind it is (icon, colour, tag), when, what happened,
 * and the one thing to do next. Unread ones carry an accent bar, a dot and a
 * bolder title — never colour alone. Read/unread and remove are always visible
 * (no hover-only controls on touch screens).
 */
export function NotificationCard({ notification: n, now, onRead, onUnread, onRemove }: Props) {
  const kind = KINDS[n.type];
  const Icon = kind.icon;
  const unread = !n.readAt;
  const action = kind.action?.(n);
  const titleId = `notification-${n.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className={`relative flex gap-3.5 overflow-hidden rounded-2xl border p-4 transition motion-reduce:transition-none sm:gap-4 sm:p-5 ${
        unread
          ? 'border-white/[0.12] bg-white/[0.045] shadow-card'
          : 'border-white/[0.06] bg-white/[0.015]'
      } ${kind.urgent && unread ? 'ring-1 ring-gold-400/40' : ''}`}
    >
      {unread ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
      ) : null}

      <span
        className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-11 sm:w-11 ${TONE_TILE[kind.tone]} ${unread ? '' : 'opacity-75'}`}
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className={`font-semibold uppercase tracking-[0.14em] ${TONE_LABEL[kind.tone]}`}>
            {kind.label}
          </span>
          <span aria-hidden="true" className="text-ink-600">
            ·
          </span>
          <time dateTime={n.createdAt} title={exactTime(n.createdAt)} className="text-ink-400">
            {relativeTime(n.createdAt, now)}
          </time>
        </p>

        <h3
          id={titleId}
          className={`mt-1.5 font-sans text-[15px] leading-snug sm:text-base ${
            unread ? 'font-semibold text-ink-50' : 'font-medium text-ink-200'
          }`}
        >
          {unread ? <span className="sr-only">Unread: </span> : null}
          {n.title}
        </h3>
        {/* Full-width card, readable line length. */}
        <p
          className={`mt-1 max-w-3xl text-sm leading-relaxed ${unread ? 'text-ink-300' : 'text-ink-400'}`}
        >
          {n.body}
        </p>

        {n.couponCode || action ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            {n.couponCode ? <CouponChip code={n.couponCode} /> : null}
            {action ? (
              <Link
                href={action.href}
                onClick={onRead}
                className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-semibold transition motion-reduce:transition-none ${
                  kind.urgent && unread
                    ? 'bg-brand-500 text-white hover:bg-brand-400'
                    : 'border border-white/10 bg-white/[0.04] text-ink-100 hover:border-white/25'
                }`}
              >
                {action.label}
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1.5">
        {unread ? (
          <span aria-hidden="true" className="mb-1 mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
        ) : null}
        <button
          type="button"
          onClick={unread ? onRead : onUnread}
          aria-label={unread ? `Mark “${n.title}” as read` : `Mark “${n.title}” as unread`}
          title={unread ? 'Mark as read' : 'Mark as unread'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-400 transition hover:bg-white/[0.07] hover:text-ink-50 motion-reduce:transition-none"
        >
          {unread ? (
            <CheckIcon className="h-[18px] w-[18px]" />
          ) : (
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-current" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove “${n.title}”`}
          title="Remove"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-400 transition hover:bg-brand-500/15 hover:text-brand-200 motion-reduce:transition-none"
        >
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </article>
  );
}

/** The offer code, with a copy button — the thing a coupon notification is for. */
function CouponChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-400/50 bg-brand-500/10 py-1 pl-3.5 pr-1">
      <span className="font-mono text-sm font-bold tracking-[0.1em] text-brand-100">{code}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(code)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
        aria-label={`Copy offer code ${code}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-brand-200 hover:bg-brand-500/20"
      >
        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? `Offer code ${code} copied` : ''}
      </span>
    </span>
  );
}
