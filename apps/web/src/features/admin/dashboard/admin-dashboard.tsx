'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { AdminDashboard as Dashboard, Trend } from '@cineseat/shared';
import {
  CalendarIcon,
  ClockIcon,
  ReceiptIcon,
  RefreshIcon,
  SeatIcon,
  TicketIcon,
  TrendDownIcon,
  TrendUpIcon,
  UsersIcon,
} from '../../../components/ui/icons';
import { useNow } from '../../../hooks/use-now';
import { useAuth } from '../../auth/auth-provider';
import { firstName } from '../../../components/layout/site-header';
import { money } from '../../catalog/format';
import { relativeTime } from '../../notifications/time';
import { useAdminDashboard } from '../queries';
import { count, greeting, longDay, percentChange } from './format';
import { RecentBookings, TopMovies, UpcomingShows } from './panels';
import { SalesChart } from './sales-chart';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The admin panel's home (`/admin`): how the week is going at a glance — money,
 * tickets, occupancy and sign-ups against the week before — then sales per day,
 * best sellers, the next shows and the latest bookings. All of it from one call
 * (GET /admin/dashboard), refreshed every minute.
 */
export function AdminDashboard() {
  const { user } = useAuth();
  const query = useAdminDashboard(user?.id);
  const now = useNow(30_000);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label">Overview</p>
          <h1 className="mt-1 font-display text-3xl text-ink-50 sm:text-4xl">Dashboard</h1>
          <p className="mt-1.5 text-sm text-ink-400">
            {now && user ? `${greeting(now)}, ${firstName(user.name)}. ` : null}
            {query.data
              ? `${longDay(query.data.today)} · figures compare the last 7 days with the 7 before.`
              : 'How CineSeat is doing this week.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-400">
          {query.data && now ? (
            <span aria-live="polite">
              Updated {relativeTime(new Date(query.dataUpdatedAt).toISOString(), now).toLowerCase()}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh the dashboard"
            className="btn-icon"
          >
            <RefreshIcon
              className={`h-4 w-4 ${query.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
          </button>
        </div>
      </header>

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <div className="card rounded-3xl p-8 text-center">
          <p className="font-display text-xl text-ink-50">Couldn’t load the dashboard</p>
          <p className="mt-2 text-sm text-ink-400">{query.error.message}</p>
          <button type="button" onClick={() => void query.refetch()} className="btn-primary mt-6">
            Try again
          </button>
        </div>
      ) : (
        <DashboardBody data={query.data} now={now ?? Date.now()} />
      )}
    </div>
  );
}

function DashboardBody({ data, now }: { data: Dashboard; now: number }) {
  const { kpis } = data;
  const occupancy = kpis.occupancy.capacity
    ? Math.round((kpis.occupancy.sold / kpis.occupancy.capacity) * 100)
    : 0;

  return (
    <>
      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          icon={ReceiptIcon}
          label="Revenue"
          value={money(kpis.revenue.current)}
          trend={kpis.revenue}
        />
        <KpiCard
          icon={TicketIcon}
          label="Tickets sold"
          value={count(kpis.ticketsSold.current)}
          trend={kpis.ticketsSold}
        />
        <KpiCard
          icon={SeatIcon}
          label="Occupancy"
          value={`${occupancy}%`}
          footer={
            <>
              <span className="mb-2 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  style={{ width: `${occupancy}%` }}
                  className="block h-full rounded-full bg-emerald-400/80"
                />
              </span>
              {count(kpis.occupancy.sold)} of {count(kpis.occupancy.capacity)} seats · next 7 days
            </>
          }
        />
        <KpiCard
          icon={UsersIcon}
          label="New users"
          value={count(kpis.newUsers.current)}
          trend={kpis.newUsers}
          note={`${count(kpis.totalUsers)} members in total`}
        />
      </section>

      <section
        aria-label="Today and this week"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] lg:grid-cols-4"
      >
        <MiniStat
          icon={TicketIcon}
          label="Bookings · 7 days"
          value={count(kpis.bookings.current)}
        />
        <MiniStat icon={CalendarIcon} label="Shows today" value={count(kpis.showsToday)} />
        <MiniStat
          icon={ClockIcon}
          label="Seats on hold now"
          value={count(kpis.activeHolds)}
          hint={
            kpis.activeHolds === 1
              ? '1 checkout in progress'
              : `${kpis.activeHolds} checkouts in progress`
          }
        />
        <MiniStat
          icon={ReceiptIcon}
          label="Refunds · 7 days"
          value={count(kpis.refunds.count)}
          hint={kpis.refunds.count ? `${money(kpis.refunds.amount)} returned` : 'Nothing returned'}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <SalesChart days={data.salesByDay} today={data.today} />
        </div>
        <TopMovies movies={data.topMovies} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <UpcomingShows shows={data.upcomingShows} today={data.today} />
        <RecentBookings bookings={data.recentBookings} now={now} />
      </div>
    </>
  );
}

function KpiCard({
  icon: IconComponent,
  label,
  value,
  trend,
  note,
  footer,
}: {
  icon: Icon;
  label: string;
  value: string;
  trend?: Trend;
  note?: string;
  footer?: ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-inset">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-300">{label}</h2>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-ink-200 ring-1 ring-white/10">
          <IconComponent className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl tabular-nums tracking-tight text-ink-50">{value}</p>
      <div className="mt-auto pt-3 text-xs text-ink-400">
        {trend ? <TrendLine trend={trend} /> : null}
        {note ? <p className={trend ? 'mt-1' : ''}>{note}</p> : null}
        {footer}
      </div>
    </article>
  );
}

function TrendLine({ trend }: { trend: Trend }) {
  const change = percentChange(trend);
  if (change === null) {
    return (
      <p>
        <span className="font-semibold text-emerald-300">New</span> · nothing in the 7 days before
      </p>
    );
  }
  const up = change > 0;
  const flat = change === 0;
  const Arrow = up ? TrendUpIcon : TrendDownIcon;
  return (
    <p className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
          flat
            ? 'bg-white/[0.06] text-ink-300'
            : up
              ? 'bg-emerald-400/10 text-emerald-300'
              : 'bg-brand-500/10 text-brand-300'
        }`}
      >
        {flat ? null : <Arrow className="h-3.5 w-3.5" />}
        <span className="sr-only">{flat ? 'No change' : up ? 'Up' : 'Down'}</span>
        {Math.abs(change)}%
      </span>
      vs previous 7 days
    </p>
  );
}

function MiniStat({
  icon: IconComponent,
  label,
  value,
  hint,
}: {
  icon: Icon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-ink-950 px-4 py-4 sm:px-5">
      <IconComponent className="hidden h-5 w-5 shrink-0 text-ink-400 sm:block" />
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-400">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-ink-50">{value}</p>
        {hint ? <p className="truncate text-[11px] text-ink-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const block = 'animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none';
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading the dashboard</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`${block} h-36`} />
        ))}
      </div>
      <span className={`${block} h-20`} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <span className={`${block} h-96 xl:col-span-2`} />
        <span className={`${block} h-96`} />
      </div>
    </div>
  );
}
