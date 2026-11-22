/**
 * Calendar maths in the cinemas' time zone without a date library.
 *
 * Shows and releases happen on local calendar days ("Friday in Dhaka"), while the
 * database stores instants (UTC). These helpers convert between the two, and stay
 * correct in zones with daylight saving, where a day is not always 24 hours.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(instant: number, timeZone: string): Record<string, number> {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  return Object.fromEntries(
    formatted.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]),
  );
}

/** How far the zone is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** `YYYY-MM-DD` of an instant, as seen in `timeZone`. */
export function dateInZone(instant: Date | number, timeZone: string): string {
  const p = parts(typeof instant === 'number' ? instant : instant.getTime(), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The instant local midnight starts `date` (`YYYY-MM-DD`) in `timeZone`. */
export function startOfDayInZone(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wallClock = Date.UTC(y, m - 1, d);
  let instant = wallClock - offsetAt(wallClock, timeZone);
  // If the offset differs at the real instant (a DST switch near midnight), use that one.
  const corrected = wallClock - offsetAt(instant, timeZone);
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/**
 * The instant a wall-clock `time` (`HH:MM`, 24h) on `date` happens in
 * `timeZone` — how an admin's "14 Nov at 18:00" becomes a show's start. In the
 * hour a DST switch skips, the clock reading is taken with the offset before it.
 */
export function instantInZone(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(y, m - 1, d, hour, minute);
  let instant = wallClock - offsetAt(wallClock, timeZone);
  const corrected = wallClock - offsetAt(instant, timeZone);
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** `[start, end)` instants of a local calendar day. */
export function dayRangeInZone(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: startOfDayInZone(date, timeZone),
    end: startOfDayInZone(addDays(date, 1), timeZone),
  };
}

/** Calendar arithmetic on `YYYY-MM-DD` strings (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `HH:MM` (24h) of an instant on the clock of `timeZone`. */
export function timeInZone(instant: Date | number, timeZone: string): string {
  const p = parts(typeof instant === 'number' ? instant : instant.getTime(), timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "Fri 13 Nov, 2:45 PM" — a show's start as people read it, on the clock of `timeZone`. */
export function showTimeLabel(instant: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
  return `${day}, ${time}`;
}
