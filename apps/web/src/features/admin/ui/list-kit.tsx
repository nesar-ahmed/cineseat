'use client';

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';
import type { SortOrder } from '@cineseat/shared';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  RefreshIcon,
  SearchIcon,
  SlidersIcon,
  SortIcon,
} from '../../../components/ui/icons';
import { Pagination } from '../../account/list-controls';

/**
 * The controls every admin list shares (movies, theaters, showtimes), so they
 * look and behave the same: status tabs with counts, search, filters, sort,
 * active-filter chips, a results footer with pages, and the empty and loading
 * states. The state they edit lives in the URL (`use-url-query.ts`).
 */

/** A row of tabs with counts (`·` while loading). Buttons with `aria-pressed`. */
export function TabPills<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: string; count: number | null | undefined }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition motion-reduce:transition-none ${
              active
                ? 'border-brand-500/70 bg-brand-500/15 text-ink-50'
                : 'border-ink-700 bg-ink-900/60 text-ink-300 hover:border-ink-500 hover:text-ink-50'
            }`}
          >
            {tab.label}
            <span
              className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums ${
                active ? 'bg-brand-500/30 text-ink-50' : 'bg-white/[0.06] text-ink-400'
              }`}
            >
              {tab.count === null || tab.count === undefined
                ? '·'
                : tab.count.toLocaleString('en-US')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Search as you type (after a short pause), with a clear button. "/" anywhere
 * on the page jumps here, as in most admin tools.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Adopt outside changes (Back, "Clear filters") without fighting the user's
  // typing: the URL keeps the search trimmed, so "abc " must not become "abc".
  const [applied, setApplied] = useState(value);
  if (value !== applied) {
    setApplied(value);
    if (value.trim() !== draft.trim()) setDraft(value);
  }

  useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const timer = window.setTimeout(() => onChangeRef.current(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        ref={input}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onChange(draft);
          if (event.key === 'Escape' && draft) {
            event.preventDefault();
            setDraft('');
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="/"
        className="input h-11 pl-10 pr-16 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange('');
            input.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-ink-500 sm:block">
          /
        </kbd>
      )}
    </div>
  );
}

/** "Filters" with the number in effect; opens the filter drawer. */
export function FiltersButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition motion-reduce:transition-none ${
        count
          ? 'border-brand-500/60 bg-brand-500/10 text-ink-50'
          : 'border-ink-700 bg-ink-950/70 text-ink-200 hover:border-ink-600'
      }`}
    >
      <SlidersIcon className="h-4 w-4" />
      Filters
      {count ? (
        <span className="rounded-full bg-brand-500 px-1.5 text-[11px] tabular-nums text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Sort key and direction. `order` is the direction in effect; choosing the
 * natural direction of a sort sends `null`, so the URL stays short.
 */
export function SortControl<S extends string>({
  id,
  sorts,
  sort,
  order,
  naturalOrder,
  orderLabel,
  onChange,
}: {
  id: string;
  sorts: { value: S; label: string }[];
  sort: S;
  order: SortOrder;
  naturalOrder: (sort: S) => SortOrder;
  orderLabel: (sort: S, order: SortOrder) => string;
  onChange: (patch: { sort?: S; order: SortOrder | null }) => void;
}) {
  const flipped = order === 'asc' ? 'desc' : 'asc';
  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor={id}>
        Sort by
      </label>
      <select
        id={id}
        value={sort}
        onChange={(event) => onChange({ sort: event.target.value as S, order: null })}
        className="select h-11 w-48"
      >
        {sorts.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange({ order: flipped === naturalOrder(sort) ? null : flipped })}
        aria-label={`${orderLabel(sort, order)} — switch to ${orderLabel(sort, flipped).toLowerCase()}`}
        title={orderLabel(sort, order)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-ink-700 bg-ink-950/70 text-ink-200 transition hover:border-ink-600 hover:text-ink-50 motion-reduce:transition-none"
      >
        {order === 'asc' ? (
          <ArrowUpIcon className="h-4 w-4" />
        ) : (
          <ArrowDownIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export type FilterChip = { key: string; label: string; remove: () => void };

/** The filters in effect as removable chips, so the view explains itself. */
export function FilterChips({
  chips,
  onClearAll,
}: {
  chips: FilterChip[];
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-500">Filtered by</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          aria-label={`Remove filter: ${chip.label}`}
          className="chip gap-1 py-1 pr-1.5 hover:border-ink-500 hover:text-ink-100"
        >
          {chip.label}
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full px-2 py-1 text-xs font-semibold text-ink-300 hover:text-ink-50"
      >
        Clear all
      </button>
    </div>
  );
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** "Showing 1–20 of 143", rows per page and the page numbers. */
export function ListFooter({
  page,
  pageSize,
  shown,
  total,
  onPageSize,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  shown: number;
  total: number;
  onPageSize: (size: number) => void;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <>
      <div className="mt-5 flex flex-col-reverse items-center justify-between gap-4 text-sm text-ink-400 sm:flex-row">
        <p aria-live="polite">
          Showing{' '}
          <span className="font-semibold tabular-nums text-ink-200">
            {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + shown}
          </span>{' '}
          of <span className="font-semibold tabular-nums text-ink-200">{total}</span>
        </p>
        <label className="flex items-center gap-2">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="select w-20 py-1.5"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pages > 1 ? (
        <Pagination page={page} pages={pages} hrefFor={hrefFor} previous="Previous" next="Next" />
      ) : null}
    </>
  );
}

/** Nothing to list: either nothing exists yet (with the way to add it), or nothing matches. */
export function EmptyResults({
  icon: Icon,
  filtered,
  onClear,
  emptyTitle,
  emptyText,
  action,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  filtered: boolean;
  onClear: () => void;
  emptyTitle: string;
  emptyText: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-ink-200 ring-1 ring-white/15">
        <Icon className="h-7 w-7" />
      </span>
      {filtered ? (
        <>
          <h2 className="mt-5 font-display text-2xl text-ink-50">Nothing matches</h2>
          <p className="mt-2 text-sm text-ink-400">Try another search, or clear the filters.</p>
          <button type="button" onClick={onClear} className="btn-ghost mt-6">
            Clear search and filters
          </button>
        </>
      ) : (
        <>
          <h2 className="mt-5 font-display text-2xl text-ink-50">{emptyTitle}</h2>
          <p className="mt-2 text-sm text-ink-400">{emptyText}</p>
          {action ? <div className="mt-6">{action}</div> : null}
        </>
      )}
    </div>
  );
}

/** A list that could not load, with a retry. */
export function ListError({
  what,
  message,
  onRetry,
}: {
  what: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="card rounded-3xl p-8 text-center">
      <p className="font-display text-xl text-ink-50">Couldn’t load the {what}</p>
      <p className="mt-2 text-sm text-ink-400">{message}</p>
      <button type="button" onClick={onRetry} className="btn-primary mt-6">
        Try again
      </button>
    </div>
  );
}

export function ListSkeleton({
  label,
  rows = 6,
  height = 'h-[88px]',
}: {
  label: string;
  rows?: number;
  height?: string;
}) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className={`${height} animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none`}
        />
      ))}
    </div>
  );
}

/** A column header that sorts, announcing its state with `aria-sort`. */
export function SortHeader<S extends string>({
  column,
  sort,
  order,
  onSort,
  className = '',
  align = 'left',
  children,
}: {
  column: S;
  sort: S;
  order: SortOrder;
  onSort: (sort: S) => void;
  className?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const active = sort === column;
  const Icon = !active ? SortIcon : order === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th
      scope="col"
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`group/sort inline-flex items-center gap-1.5 rounded-md hover:text-ink-100 ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-ink-50' : ''}`}
      >
        {children}
        <Icon
          className={`h-3.5 w-3.5 ${active ? 'text-brand-300' : 'opacity-40 group-hover/sort:opacity-80'}`}
        />
      </button>
    </th>
  );
}

/** A real checkbox (keyboard, screen readers), drawn to match the dark theme. */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-ink-600 bg-ink-950 accent-brand-500"
    />
  );
}

/** Clicking the active column flips it; another column starts in its natural direction. */
export function nextSort<S extends string>(
  column: S,
  current: { sort: S; order: SortOrder },
): { sort?: S; order: SortOrder | null } {
  return column === current.sort
    ? { order: current.order === 'asc' ? 'desc' : 'asc' }
    : { sort: column, order: null };
}

/**
 * A selection of rows that belongs to one view: it empties when `viewKey`
 * (page, filters, sort) changes.
 */
export function useSelection(viewKey: string) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setSelected(new Set()), [viewKey]);
  return {
    selected,
    toggle: (id: string) =>
      setSelected((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    setAll: (ids: string[]) => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
  };
}

/** Re-asks the server now (the lists also refresh on focus and after every change). */
export function RefreshButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={label} className="btn-icon">
      <RefreshIcon className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    </button>
  );
}

/**
 * A list's paging guard: deleting the last items of the last page leaves it
 * empty — step back to the last page that exists.
 */
export function usePageClamp(
  data: { total: number; pageSize: number } | undefined,
  stale: boolean,
  page: number,
  goTo: (page: number) => void,
) {
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  useEffect(() => {
    if (data && !stale && page > pages) goTo(pages);
  }, [data, stale, page, pages, goTo]);
}

/** A strip of totals above a list: what the current view adds up to. */
export function TotalsStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] lg:grid-cols-4"
    >
      {children}
    </section>
  );
}

/** One figure of a `TotalsStrip`; `tone` colours the value. */
export function TotalTile({
  icon: IconComponent,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'bad' | 'info' | 'open';
}) {
  const color = {
    default: 'text-ink-50',
    good: 'text-emerald-300',
    bad: 'text-brand-300',
    info: 'text-sky-300',
    open: 'text-gold-300',
  }[tone];
  return (
    <div className="flex items-center gap-3 bg-ink-950 px-4 py-4 sm:px-5">
      <IconComponent className="hidden h-5 w-5 shrink-0 text-ink-400 sm:block" />
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-400">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
        {hint ? <p className="truncate text-[11px] text-ink-500">{hint}</p> : null}
      </div>
    </div>
  );
}
