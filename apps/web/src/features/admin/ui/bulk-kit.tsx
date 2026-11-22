'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Dialog } from '../../../components/ui/dialog';
import { AlertIcon, CloseIcon } from '../../../components/ui/icons';
import { plural } from './format';

/**
 * Bulk actions on a list's selection: a bar at the bottom while rows are
 * selected, and a dialog listing what could not be done (each item succeeds or
 * fails on its own in the API), with the reasons.
 */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  /** "movie" → "3 movies selected". */
  noun: string;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3 lg:left-[var(--admin-sidebar)]">
      <div
        role="region"
        aria-label="Bulk actions"
        className="pointer-events-auto flex max-w-full animate-fade-up items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-ink-900/95 p-1.5 shadow-lift backdrop-blur-xl motion-reduce:animate-none sm:gap-2"
      >
        <span
          className="whitespace-nowrap px-3 text-sm font-semibold text-ink-50"
          aria-live="polite"
        >
          {plural(count, noun)} selected
        </span>
        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-white/10" />
        {children}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function BarButton({
  onClick,
  disabled,
  icon: Icon,
  danger = false,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  danger?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50 motion-reduce:transition-none ${
        danger
          ? 'text-brand-300 hover:bg-brand-500/10'
          : 'text-ink-200 hover:bg-white/[0.06] hover:text-ink-50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

export type BulkFailure = { id: string; label: string | null; message: string };

/** What a bulk action could not do, with why; those items stay selected. */
export function BulkFailuresDialog({
  failures,
  noun,
  onClose,
}: {
  failures: BulkFailure[] | null;
  noun: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={failures !== null}
      onClose={onClose}
      icon={AlertIcon}
      title={failures ? `${plural(failures.length, noun)} couldn’t be changed` : ''}
      description="They are still selected. Everything else went through."
      footer={
        <button type="button" data-autofocus onClick={onClose} className="btn-ghost py-2.5">
          OK
        </button>
      }
    >
      <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07]">
        {failures?.map((failure) => (
          <li key={failure.id} className="px-3.5 py-2.5 text-sm">
            <p className="font-semibold text-ink-100">{failure.label ?? failure.id}</p>
            <p className="text-ink-400">{failure.message}</p>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** "Some will be skipped" inside a bulk confirmation, listing the first few. */
export function SkipNotice({
  all,
  items,
  reason,
}: {
  all: boolean;
  items: { id: string; label: string }[];
  /** "they have tickets" / "it has tickets" follows from the count. */
  reason: (one: boolean) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-gold-500/30 bg-gold-400/[0.07] px-3.5 py-3 text-sm text-gold-100">
      <p className="font-semibold">
        {all
          ? `None of these can be changed: ${reason(items.length === 1)}.`
          : `${items.length} will be skipped: ${reason(items.length === 1)}.`}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-gold-200/90">
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
        {items.length > 5 ? <li>and {items.length - 5} more</li> : null}
      </ul>
    </div>
  );
}
