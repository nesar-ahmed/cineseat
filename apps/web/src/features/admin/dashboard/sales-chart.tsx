'use client';

import { useState } from 'react';
import type { AdminDashboard } from '@cineseat/shared';
import { compact, money } from '../../catalog/format';
import { chartDay, count, niceScale } from './format';

type Metric = 'revenue' | 'tickets';

/**
 * Sales per day for the last 14 cinema days, today on the right. Bars are
 * buttons, so the numbers behind each are reachable by keyboard as well as by
 * pointer; a hidden table carries the same data for screen readers.
 */
export function SalesChart({ days, today }: { days: AdminDashboard['salesByDay']; today: string }) {
  const [metric, setMetric] = useState<Metric>('revenue');
  const [active, setActive] = useState<string | null>(null);

  const values = days.map((d) => d[metric]);
  const ticks = niceScale(Math.max(...values, 0));
  const top = ticks[ticks.length - 1] || 1;
  const total = values.reduce((sum, v) => sum + v, 0);
  // Whole taka (or whole tickets): an average needs no paisa.
  const unit = metric === 'revenue' ? 100 : 1;
  const average = Math.round(total / Math.max(1, days.length) / unit) * unit;
  const format = (value: number) => (metric === 'revenue' ? money(value) : count(value));
  const axis = (value: number) =>
    metric === 'revenue' ? `৳${compact(value / 100)}` : compact(value);

  return (
    <section
      aria-labelledby="sales-title"
      className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-inset sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="sales-title" className="text-base font-semibold text-ink-50">
            Sales
          </h2>
          <p className="text-xs text-ink-400">Last 14 days · on the cinemas’ clock</p>
        </div>
        <div
          role="group"
          aria-label="Chart metric"
          className="flex rounded-full border border-white/10 p-0.5"
        >
          {(['revenue', 'tickets'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={metric === option}
              onClick={() => setMetric(option)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition motion-reduce:transition-none ${
                metric === option ? 'bg-white/[0.1] text-ink-50' : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-4 flex gap-8">
        <div>
          <dt className="text-xs text-ink-400">Total</dt>
          <dd className="font-display text-2xl tabular-nums text-ink-50">{format(total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">Daily average</dt>
          <dd className="font-display text-2xl tabular-nums text-ink-200">{format(average)}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-1 gap-3">
        {/* Y axis: each label sits on its grid line. */}
        <div
          aria-hidden="true"
          className="relative h-56 w-10 shrink-0 text-right text-[10px] tabular-nums text-ink-500"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              style={{ bottom: `${(tick / top) * 100}%` }}
              className="absolute right-0 translate-y-1/2 leading-none"
            >
              {axis(tick)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-56">
            {ticks.map((tick) => (
              <span
                key={tick}
                style={{ bottom: `${(tick / top) * 100}%` }}
                className="absolute inset-x-0 block h-px bg-white/[0.06]"
              />
            ))}
          </div>

          <ol className="relative flex h-56 items-end gap-1 sm:gap-1.5">
            {days.map((d, index) => {
              const value = d[metric];
              // Near the ends the tooltip hangs inwards, so it never leaves the card.
              const anchor =
                index < 3
                  ? 'left-0'
                  : index > days.length - 4
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2';
              const height = Math.max(value > 0 ? 2 : 0, (value / top) * 100);
              const isToday = d.date === today;
              const open = active === d.date;
              const info = chartDay(d.date);
              return (
                <li key={d.date} className="relative flex h-full flex-1 items-end">
                  <button
                    type="button"
                    onMouseEnter={() => setActive(d.date)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(d.date)}
                    onBlur={() => setActive(null)}
                    aria-label={`${info.label}${isToday ? ' (today)' : ''}: ${money(d.revenue)}, ${count(d.tickets)} tickets`}
                    className="group flex h-full w-full items-end rounded-t-md outline-none"
                  >
                    <span
                      style={{ height: `${height}%` }}
                      className={`block w-full rounded-t-md transition-[height,background-color] duration-300 motion-reduce:transition-none ${
                        isToday
                          ? 'bg-brand-500'
                          : open
                            ? 'bg-brand-400/80'
                            : 'bg-brand-500/40 group-hover:bg-brand-400/70'
                      } group-focus-visible:ring-2 group-focus-visible:ring-brand-300`}
                    />
                  </button>
                  {open ? (
                    <span
                      role="presentation"
                      className={`pointer-events-none absolute ${anchor} z-10 whitespace-nowrap rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs shadow-lift`}
                      style={{ bottom: `calc(${height}% + 0.5rem)` }}
                    >
                      <span className="block font-semibold text-ink-50">{info.label}</span>
                      <span className="block text-ink-300">
                        {money(d.revenue)} · {count(d.tickets)} tickets
                      </span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <ol aria-hidden="true" className="mt-2 flex gap-1 sm:gap-1.5">
            {days.map((d) => {
              const info = chartDay(d.date);
              const isToday = d.date === today;
              return (
                <li
                  key={d.date}
                  className={`flex-1 text-center text-[10px] leading-tight tabular-nums ${
                    isToday ? 'font-semibold text-brand-300' : 'text-ink-500'
                  }`}
                >
                  <span className="block">{info.weekday}</span>
                  <span className="block">{info.day}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <table className="sr-only">
        <caption>Sales per day, last 14 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Revenue</th>
            <th scope="col">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{chartDay(d.date).label}</th>
              <td>{money(d.revenue)}</td>
              <td>{count(d.tickets)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
