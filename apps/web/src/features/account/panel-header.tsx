import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon } from '../../components/ui/icons';

export type Crumb = { label: string; href?: string; mono?: boolean };

/**
 * The top of every user-panel page: a trail back to where you came from, then
 * the page's eyebrow, title and one line of context. `actions` sits opposite the
 * title on wide screens (a status badge, "Mark all as read", …).
 */
export function PanelHeader({
  trail,
  eyebrow,
  title,
  description,
  actions,
}: {
  trail: Crumb[];
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1.5 text-ink-400">
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href && !last ? (
                  <Link
                    href={crumb.href}
                    className="inline-flex items-center gap-1 rounded-full py-1 pr-1 hover:text-ink-100"
                  >
                    {index === 0 ? <ChevronLeftIcon className="h-4 w-4" /> : null}
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={`${last ? 'text-ink-100' : 'text-ink-300'} ${crumb.mono ? 'font-mono' : ''}`}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="section-label">{eyebrow}</p>
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm text-ink-400 sm:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </header>
    </div>
  );
}
