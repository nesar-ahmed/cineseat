/**
 * Display helpers. Shows belong to the cinema, so dates are the API's calendar
 * dates (`YYYY-MM-DD`, cinema time zone) and "today" is today in that zone — a
 * 6:00 PM show reads 6:00 PM wherever the visitor is.
 */
export const CINEMA_TIME_ZONE = 'Asia/Dhaka';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in the cinema's time zone. */
export function cinemaToday(now: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CINEMA_TIME_ZONE }).format(new Date(now));
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const utc = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** Calendar parts of a `YYYY-MM-DD` date, and how to say it relative to `today`. */
export function dayInfo(date: string, today: string = cinemaToday()) {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(at);
  const offset = daysBetween(today, date);
  const weekday = part({ weekday: 'short' });
  const day = part({ day: 'numeric' });
  const month = part({ month: 'short' });
  return {
    date,
    offset,
    weekday,
    day,
    month,
    /** "Today", "Tomorrow", then "Fri 14". */
    label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : `${weekday} ${day}`,
    /** "Fri, 14 Nov". */
    long: `${weekday}, ${day} ${month}`,
  };
}

/** `2026-11-14` → `14 November 2026` (a calendar date, so it reads the same in every zone). */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** `18:00` → `6:00 PM`. */
export function time12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** `138` → `2h 18m`. */
export function runtime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/** Taka from the API's minor units (poisha): `40000` → `৳400`. */
export function money(minor: number): string {
  const taka = minor / 100;
  return `৳${taka.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(taka) ? 0 : 2 })}`;
}

/** Whole taka for fixed marketing prices: `400` → `৳400`. */
export function taka(amount: number): string {
  return `৳${amount.toLocaleString('en-US')}`;
}

/** `18420` → `18.4K`. */
export function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** "In cinemas" / "Releases tomorrow" / "Releases Fri" / "Releases Fri, 24 Nov". */
export function releaseLabel(releaseDate: string, today: string = cinemaToday()): string {
  const offset = daysBetween(today, releaseDate);
  if (offset <= 0) return 'In cinemas';
  if (offset === 1) return 'Releases tomorrow';
  const info = dayInfo(releaseDate, today);
  return offset < 7 ? `Releases ${info.weekday}` : `Releases ${info.long}`;
}
