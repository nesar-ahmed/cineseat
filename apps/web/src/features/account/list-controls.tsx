import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/ui/icons';

/**
 * The controls every list in the user panel shares — filter pills and numbered
 * pages — so tickets, invoices and notifications look and behave alike. Both
 * are links: the filter and page live in the URL, so Back and refresh work.
 */

/** A row of filter pills that scrolls sideways on phones and wraps on wider screens. */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="min-w-0">
      <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {children}
      </ul>
    </nav>
  );
}

/** One filter: its label and, once known, how many items it holds (`·` while loading). */
export function FilterPill({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number | null | undefined;
  active: boolean;
}) {
  return (
    <li className="shrink-0">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition motion-reduce:transition-none ${
          active
            ? 'border-brand-500/70 bg-brand-500/15 text-ink-50'
            : 'border-ink-700 bg-ink-900/60 text-ink-300 hover:border-ink-500 hover:text-ink-50'
        }`}
      >
        {label}
        <span
          className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums ${
            active ? 'bg-brand-500/30 text-ink-50' : 'bg-white/[0.06] text-ink-400'
          }`}
        >
          {count === null || count === undefined ? '·' : count.toLocaleString('en-US')}
        </span>
      </Link>
    </li>
  );
}

/** Previous · 1 … 4 5 6 … 45 · Next. `hrefFor(page)` builds each page's URL. */
export function Pagination({
  page,
  pages,
  hrefFor,
  previous = 'Newer',
  next = 'Older',
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  previous?: string;
  next?: string;
}) {
  const arrow =
    'inline-flex h-10 items-center gap-1 rounded-full border border-ink-700 px-3.5 text-sm font-semibold';
  return (
    <nav aria-label="Pages" className="mt-8 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={`${arrow} text-ink-100 hover:border-ink-500`}>
          <ChevronLeftIcon className="h-4 w-4" />
          <span className="hidden xs:inline">{previous}</span>
        </Link>
      ) : (
        <span aria-hidden="true" className={`${arrow} text-ink-600`}>
          <ChevronLeftIcon className="h-4 w-4" />
          <span className="hidden xs:inline">{previous}</span>
        </span>
      )}

      {/* Phones get the first, current and last page; wider screens also the neighbours. */}
      <PageNumbers
        items={pageWindow(page, pages, 0)}
        page={page}
        hrefFor={hrefFor}
        className="flex xs:hidden"
      />
      <PageNumbers
        items={pageWindow(page, pages, 1)}
        page={page}
        hrefFor={hrefFor}
        className="hidden xs:flex"
      />

      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={`${arrow} text-ink-100 hover:border-ink-500`}>
          <span className="hidden xs:inline">{next}</span>
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${arrow} text-ink-600`}>
          <span className="hidden xs:inline">{next}</span>
          <ChevronRightIcon className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}

function PageNumbers({
  items,
  page,
  hrefFor,
  className,
}: {
  items: (number | 'gap')[];
  page: number;
  hrefFor: (page: number) => string;
  className: string;
}) {
  return (
    <ol className={`${className} items-center gap-1`}>
      {items.map((item, index) =>
        item === 'gap' ? (
          <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-500">
            …
          </li>
        ) : (
          <li key={item}>
            <Link
              href={hrefFor(item)}
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums transition motion-reduce:transition-none ${
                item === page
                  ? 'bg-brand-500 text-white'
                  : 'text-ink-300 hover:bg-white/[0.06] hover:text-ink-50'
              }`}
            >
              {item}
            </Link>
          </li>
        ),
      )}
    </ol>
  );
}

/**
 * 1 … 4 5 6 … 45 — the first, the last, the current page and `around` pages
 * either side of it; a gap wherever pages are skipped.
 */
function pageWindow(page: number, pages: number, around: number): (number | 'gap')[] {
  const near = Array.from({ length: around * 2 + 1 }, (_, i) => page - around + i);
  const keep = new Set([1, pages, ...near].filter((p) => p >= 1 && p <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/** Reads `?page=` safely: a positive whole number, 1 otherwise. */
export function pageParam(value: string | null): number {
  return Math.max(1, Number.parseInt(value ?? '1', 10) || 1);
}
