import { CINEMA_TIME_ZONE, cinemaToday } from '../../catalog/format';
import { clock, showDay } from '../dashboard/format';

/**
 * Formatting every admin module shares. Shows belong to the cinemas, so days and
 * times are on the cinemas' clock (`CINEMA_TIME_ZONE`), wherever the admin is.
 */

/** "Today · 6:00 PM", "Tomorrow · 1:30 PM", "Sat 14 · 9:00 PM". */
export function showLabel(iso: string, today: string = cinemaToday()): string {
  return `${showDay(iso, today)} · ${clock(iso)}`;
}

/** "12 Nov 2026" for a `YYYY-MM-DD` cinema date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Fri, 13 Nov" for a `YYYY-MM-DD` cinema date. */
export function weekdayDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "12 Nov 2026, 7:49 PM" for an instant, on the cinemas' clock. */
export function shortDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** `18:00` → `6:00 PM`. */
export function clock12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** Formats in a steady order (2D before 3D), whatever order they were saved in. */
export const sortedFormats = <T extends string>(formats: readonly T[]): T[] => [...formats].sort();

/** "1 show" / "12 shows". */
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

/** Whole percent of `part` in `whole` (0 when there is no whole). */
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant (ISO, UTC) a cinema-clock `date` + `time` (`HH:MM`) happens — the
 * same conversion the API does for batch scheduling (`instantInZone`).
 */
export function cinemaInstant(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(y, m - 1, d, hour, minute);
  let instant = wallClock - offsetAt(wallClock, CINEMA_TIME_ZONE);
  const corrected = wallClock - offsetAt(instant, CINEMA_TIME_ZONE);
  if (corrected !== instant) instant = corrected;
  return new Date(instant).toISOString();
}

/** `HH:MM` of an instant on the cinemas' clock (24h). */
export function cinemaTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Taka typed by an admin → the API's minor units (poisha); NaN stays NaN. */
export const toMinor = (taka: string) =>
  taka.trim() === '' ? Number.NaN : Math.round(Number(taka) * 100);
/** Minor units → whole taka for an input field. */
export const toTaka = (minor: number) => String(minor / 100);

/** Calendar arithmetic on `YYYY-MM-DD` (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Every date from `from` to `to` (inclusive), at most `limit`. */
export function datesBetween(from: string, to: string, limit = 62): string[] {
  const out: string[] = [];
  for (let date = from; date <= to && out.length < limit; date = addDays(date, 1)) out.push(date);
  return out;
}

/** 0 = Monday … 6 = Sunday, for a `YYYY-MM-DD` date. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
