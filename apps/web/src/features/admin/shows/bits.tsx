import type { AdminShow, AdminShowState, ShowAvailability } from '@cineseat/shared';
import { Badge, type BadgeTone } from '../ui/bits';
import { cinemaTime, clock12, weekdayDate } from '../ui/format';

/** What is particular to shows; shared pieces live in `../ui`. */

const STATE: Record<AdminShowState, { label: string; tone: BadgeTone }> = {
  UPCOMING: { label: 'Upcoming', tone: 'blue' },
  RUNNING: { label: 'On screen now', tone: 'green' },
  ENDED: { label: 'Ended', tone: 'gray' },
};

export function StateBadge({ state }: { state: AdminShowState }) {
  return <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>;
}

const AVAILABILITY: Record<ShowAvailability, { label: string; tone: BadgeTone }> = {
  AVAILABLE: { label: 'On sale', tone: 'gray' },
  FILLING: { label: 'Filling up', tone: 'blue' },
  ALMOST_FULL: { label: 'Almost full', tone: 'gold' },
  SOLD_OUT: { label: 'Sold out', tone: 'rose' },
};

export function AvailabilityBadge({ availability }: { availability: ShowAvailability }) {
  const { label, tone } = AVAILABILITY[availability];
  return <Badge tone={tone}>{label}</Badge>;
}

/** "Fri, 13 Nov · 6:00 PM – 8:00 PM" on the cinemas' clock. */
export function showWhen(show: Pick<AdminShow, 'date' | 'time' | 'endsAt'>): string {
  return `${weekdayDate(show.date)} · ${clock12(show.time)} – ${clock12(cinemaTime(show.endsAt))}`;
}

/** "Dhaka Noir · Fri, 13 Nov, 6:00 PM" — a show in a dialog's title. */
export const showName = (show: Pick<AdminShow, 'movie' | 'date' | 'time'>) =>
  `${show.movie.title} · ${weekdayDate(show.date)}, ${clock12(show.time)}`;

/** Why a listed show cannot be changed, from what the list knows (the detail has the API's words). */
export function lockReason(show: Pick<AdminShow, 'state' | 'seats'>): string | null {
  if (show.state !== 'UPCOMING') return 'It has already started.';
  if (show.seats.sold || show.seats.held) return 'Seats are sold or held.';
  return null;
}
