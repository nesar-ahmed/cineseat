import { CINEMA_TIME_ZONE, cinemaToday, daysBetween } from '../catalog/format';

/** `YYYY-MM-DD` of an instant on the cinemas' clock (every time on the site uses it). */
function dayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CINEMA_TIME_ZONE }).format(new Date(iso));
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: CINEMA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** "Just now", "5 min ago", "3 h ago", "Yesterday, 9:15 PM", "Mon, 9:15 PM", "12 Nov". */
export function relativeTime(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  const days = daysBetween(dayOf(iso), cinemaToday(now));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (days === 0) return `${Math.floor(minutes / 60)} h ago`;
  if (days === 1) return `Yesterday, ${clock(iso)}`;
  if (days < 7) {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: CINEMA_TIME_ZONE,
      weekday: 'short',
    }).format(new Date(iso));
    return `${weekday}, ${clock(iso)}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** "Tuesday, 10 November 2026 at 7:49 PM" — the tooltip on every relative time. */
export function exactTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export type DayGroup = 'Today' | 'Yesterday' | 'This week' | 'Earlier';
export const DAY_GROUPS: DayGroup[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

export function dayGroup(iso: string, now: number): DayGroup {
  const days = daysBetween(dayOf(iso), cinemaToday(now));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}
