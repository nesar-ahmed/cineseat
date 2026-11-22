import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import type { AdminHistoryEntry } from '@cineseat/shared';
import { ChevronLeftIcon, HistoryIcon } from '../../../components/ui/icons';
import { exactTime, relativeTime } from '../../notifications/time';
import { shortDateTime } from './format';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The pieces every admin detail page is made of (a movie, a theater, a show),
 * so they share one layout: a way back, figures, titled panels, facts, the
 * history timeline, and the loading, missing and failed states.
 */

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-ink-400 hover:text-ink-100"
    >
      <ChevronLeftIcon className="h-4 w-4" />
      {children}
    </Link>
  );
}

/** One headline number, with what it means underneath. */
export function Figure({
  icon: IconComponent,
  label,
  value,
  note,
  children,
}: {
  icon: Icon;
  label: string;
  value: string;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-inset sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium text-ink-300 sm:text-sm">{label}</h2>
        <span className="hidden h-8 w-8 items-center justify-center rounded-xl bg-white/[0.05] text-ink-200 ring-1 ring-white/10 sm:inline-flex">
          <IconComponent className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl tabular-nums tracking-tight text-ink-50 sm:text-3xl">
        {value}
      </p>
      {children}
      {note ? <p className="mt-auto truncate pt-2 text-xs text-ink-400">{note}</p> : null}
    </article>
  );
}

/** A titled panel; `action` sits on the right of the title (a button or a link). */
export function Card({
  title,
  subtitle,
  icon: IconComponent,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: Icon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-inset">
      <div className="flex items-start gap-2.5 px-5 pb-3 pt-5 sm:px-6">
        {IconComponent ? <IconComponent className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /> : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink-50">{title}</h2>
          {subtitle ? <p className="text-xs text-ink-400">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Fact({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-ink-100">{children}</dd>
    </div>
  );
}

export const Missing = ({ children = 'Not set' }: { children?: ReactNode }) => (
  <span className="text-ink-500">{children}</span>
);

/** Label on the left, value on the right, one per line (limits, prices). */
export function KeyValues({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-white/[0.05] border-t border-white/[0.05] text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4 px-5 py-3 sm:px-6">
          <dt className="shrink-0 text-ink-400">{row.label}</dt>
          <dd className="text-right text-ink-100">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The audit trail of one thing, newest first. `describe` turns an entry into
 * words for its module ("Edited screen Screen 2: name, formats").
 */
export function HistoryCard({
  entries,
  now,
  describe,
  empty,
}: {
  entries: AdminHistoryEntry[];
  now: number | null;
  describe: (entry: AdminHistoryEntry) => ReactNode;
  empty: string;
}) {
  return (
    <Card title="History" subtitle="Changes made in the admin panel" icon={HistoryIcon}>
      {entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-400 sm:px-6">{empty}</p>
      ) : (
        <ol className="border-t border-white/[0.05] px-5 py-4 sm:px-6">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < entries.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[5px] top-4 w-px bg-white/10"
                />
              ) : null}
              <span
                aria-hidden="true"
                className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-ink-500 bg-ink-900"
              />
              <div className="min-w-0 text-sm">
                <p className="text-ink-100">{describe(entry)}</p>
                <p className="truncate text-xs text-ink-400">
                  {entry.actor.name} ·{' '}
                  <time dateTime={entry.at} title={exactTime(entry.at)}>
                    {now ? relativeTime(entry.at, now) : shortDateTime(entry.at)}
                  </time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Field names as the forms call them, for history lines. */
export function fieldList(fields: string[], labels: Record<string, string>): string {
  return fields.map((field) => labels[field] ?? field).join(', ');
}

/** A page whose thing does not exist (deleted, or a wrong link), inside the admin frame. */
export function MissingPage({
  icon: IconComponent,
  title,
  backHref,
  backLabel,
}: {
  icon: Icon;
  title: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-ink-200 ring-1 ring-white/15">
          <IconComponent className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-3xl text-ink-50">{title}</h1>
        <p className="mt-3 text-sm text-ink-400">It may have been deleted, or the link is wrong.</p>
        <Link href={backHref} className="btn-primary mt-7">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

export function LoadError({
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

export function DetailSkeleton({ label, poster = true }: { label: string; poster?: boolean }) {
  const block = 'animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none';
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <span className="sr-only">{label}</span>
      <div className="flex gap-6">
        {poster ? <span className={`${block} aspect-[2/3] w-32 sm:w-40`} /> : null}
        <div className="flex flex-1 flex-col gap-3 pt-2">
          <span className={`${block} h-6 w-40`} />
          <span className={`${block} h-10 w-2/3`} />
          <span className={`${block} h-4 w-1/2`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`${block} h-28`} />
        ))}
      </div>
      <span className={`${block} h-80`} />
    </div>
  );
}

/** The page title block every admin page starts with. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="section-label">{eyebrow}</p>
        <h1 className="mt-1 font-display text-3xl text-ink-50 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-ink-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
