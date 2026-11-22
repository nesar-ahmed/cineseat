import type { Trend } from '@cineseat/shared';
import { CINEMA_TIME_ZONE, daysBetween } from '../../catalog/format';

/** Change from the previous period, in whole percent; null when there was nothing before. */
export function percentChange({ current, previous }: Trend): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "12,480" */
export const count = (value: number) => value.toLocaleString('en-US');

/** `YYYY-MM-DD` of an instant on the cinemas' clock. */
export function cinemaDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CINEMA_TIME_ZONE }).format(new Date(iso));
}

/** "6:00 PM" on the cinemas' clock. */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CINEMA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "Today", "Tomorrow" or "Sat 14" for a show's day, relative to the cinemas' `today`. */
export function showDay(iso: string, today: string): string {
  const date = cinemaDate(iso);
  const offset = daysBetween(today, date);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

/** "Good morning" / "Good afternoon" / "Good evening" on the cinemas' clock. */
export function greeting(now: number): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CINEMA_TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(now)),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Thursday, 12 November" for a `YYYY-MM-DD` cinema date. */
export function longDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** The parts of a `YYYY-MM-DD` date the chart's axis needs. */
export function chartDay(date: string): { day: string; weekday: string; label: string } {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(at);
  return {
    day: part({ day: 'numeric' }),
    weekday: part({ weekday: 'narrow' }),
    label: part({ weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

/** A round axis maximum at or above `max`, split into `steps` equal ticks. */
export function niceScale(max: number, steps = 4): number[] {
  if (max <= 0) return Array.from({ length: steps + 1 }, (_, i) => i);
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}
