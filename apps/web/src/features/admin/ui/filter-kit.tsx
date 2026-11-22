'use client';

import { useId, useState, type ReactNode } from 'react';
import { CloseIcon } from '../../../components/ui/icons';
import { Overlay } from '../../../components/ui/overlay';

/**
 * The side panel every admin list filters in. Choices are a draft until "Show
 * results", so the list does not jump with each click; closing without applying
 * keeps what was there. `children` draws the groups from the draft.
 */
export function FilterDrawer<T>({
  open,
  onClose,
  title,
  value,
  empty,
  onApply,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The filters in effect. */
  value: T;
  /** No filters (what "Clear all" sets). */
  empty: T;
  onApply: (filters: T) => void;
  children: (draft: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(value);
  // Start from what is applied each time the drawer opens (and only then: the
  // list refreshing in the background must not wipe choices being made).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(value);
  }
  const set = (patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Overlay
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="absolute inset-y-0 right-0 flex w-[min(26rem,100vw)] animate-fade-in flex-col border-l border-white/10 bg-ink-900 shadow-lift motion-reduce:animate-none"
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
        <h2 id={titleId} className="font-sans text-base font-semibold text-ink-50">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="btn-icon h-9 w-9"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">{children(draft, set)}</div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
        <button
          type="button"
          onClick={() => setDraft(empty)}
          className="rounded-full px-3 py-2 text-sm font-semibold text-ink-300 hover:bg-white/[0.06] hover:text-ink-50"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          className="btn-primary py-2.5"
        >
          Show results
        </button>
      </div>
    </Overlay>
  );
}

export function FilterGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="field-label flex w-full items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint ? (
          <span className="text-[11px] font-medium normal-case tracking-normal text-ink-500">
            {hint}
          </span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

/** Adds `value` to the list, or takes it out. */
export const toggleIn = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/**
 * Multiple choice as toggle pills (`aria-pressed`). Options are `value` or
 * `{ value, label }`; matching ignores case (filters coming from a URL).
 */
export function TogglePills({
  options,
  chosen,
  onToggle,
  title,
  empty = 'Loading…',
}: {
  options: readonly (string | { value: string; label: string })[];
  chosen: readonly string[];
  onToggle: (value: string) => void;
  title?: (value: string) => string;
  empty?: string;
}) {
  if (options.length === 0) return <p className="text-sm text-ink-500">{empty}</p>;
  const isChosen = (value: string) =>
    chosen.some((item) => item.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const { value, label } =
          typeof option === 'string' ? { value: option, label: option } : option;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isChosen(value)}
            title={title?.(value)}
            onClick={() =>
              onToggle(chosen.find((item) => item.toLowerCase() === value.toLowerCase()) ?? value)
            }
            className="pill py-1.5"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** One of a few, as a segmented control of radio buttons. */
export function Choice({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <div
      className="grid gap-1 rounded-xl border border-ink-700 bg-ink-950/60 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([option, label]) => (
        <label
          key={option}
          className={`flex cursor-pointer items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-semibold leading-tight transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-400 motion-reduce:transition-none ${
            value === option
              ? 'bg-brand-500/20 text-ink-50 ring-1 ring-brand-500/50'
              : 'text-ink-300 hover:text-ink-50'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/** A from–to pair of date inputs (cinema days). */
export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-ink-400">
        From
        <input
          type="date"
          value={from ?? ''}
          max={to ?? undefined}
          onChange={(event) => onChange({ from: event.target.value || null, to })}
          className="input mt-1"
        />
      </label>
      <label className="text-xs text-ink-400">
        To
        <input
          type="date"
          value={to ?? ''}
          min={from ?? undefined}
          onChange={(event) => onChange({ from, to: event.target.value || null })}
          className="input mt-1"
        />
      </label>
    </div>
  );
}
