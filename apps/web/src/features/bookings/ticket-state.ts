import type { Booking } from '@cineseat/shared';
import { dayInfo, time12 } from '../catalog/format';
import { bookingHref } from './queries';

/**
 * What a booking means to its owner right now — one answer for the tickets
 * list, the overview and the ticket page, so they never disagree. `now` is null
 * before hydration; a paid show then reads as upcoming until the clock is known.
 */
export type TicketKind =
  | 'today'
  | 'upcoming'
  | 'screened'
  | 'awaiting'
  | 'hold-ended'
  | 'refunded'
  | 'not-completed'
  | 'cancelled';

export type TicketTone = 'gold' | 'emerald' | 'muted';

export type TicketState = {
  kind: TicketKind;
  label: string;
  tone: TicketTone;
  /** The one thing to do next, and where it happens. */
  cta: string;
  href: string;
};

export function ticketState(booking: Booking, now: number | null): TicketState {
  const details = bookingHref(booking.id);
  switch (booking.status) {
    case 'CONFIRMED': {
      if (now !== null && Date.parse(booking.show.startsAt) <= now) {
        return {
          kind: 'screened',
          label: 'Screened',
          tone: 'muted',
          cta: 'View ticket',
          href: details,
        };
      }
      const today = dayInfo(booking.show.date).offset === 0;
      return today
        ? { kind: 'today', label: 'Today', tone: 'gold', cta: 'View ticket', href: details }
        : {
            kind: 'upcoming',
            label: 'Upcoming',
            tone: 'emerald',
            cta: 'View ticket',
            href: details,
          };
    }
    case 'PENDING': {
      const live =
        booking.expiresAt !== null && (now === null || Date.parse(booking.expiresAt) > now);
      return live
        ? {
            kind: 'awaiting',
            label: 'Awaiting payment',
            tone: 'gold',
            cta: 'Continue checkout',
            href: `/checkout/${encodeURIComponent(booking.id)}`,
          }
        : { kind: 'hold-ended', label: 'Hold ended', tone: 'muted', cta: 'Details', href: details };
    }
    case 'FAILED':
      return booking.payment?.status === 'REFUNDED'
        ? { kind: 'refunded', label: 'Refunded', tone: 'muted', cta: 'Details', href: details }
        : {
            kind: 'not-completed',
            label: 'Not completed',
            tone: 'muted',
            cta: 'Details',
            href: details,
          };
    case 'CANCELLED':
      return {
        kind: 'cancelled',
        label: 'Cancelled',
        tone: 'muted',
        cta: 'Details',
        href: details,
      };
  }
}

/** Badge colours per tone — border + text, readable on the dark cards. */
export const TONE_BADGE: Record<TicketTone, string> = {
  gold: 'border-gold-400/50 bg-gold-400/10 text-gold-200',
  emerald: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  muted: 'border-white/15 bg-white/[0.03] text-ink-300',
};

/** "Today · 9:15 PM", "Tomorrow · 6:00 PM", "Sun, 15 Nov · 9:15 PM" — the cinema's clock. */
export function showWhen(booking: Booking): string {
  const day = dayInfo(booking.show.date);
  const label = day.offset === 0 || day.offset === 1 ? day.label : day.long;
  return `${label} · ${time12(booking.show.time)}`;
}

/** The seats of a booking by category — "2 × Premium · ৳700" lines for a receipt. */
export function seatLines(booking: Booking) {
  const lines = new Map<
    string,
    {
      category: Booking['seats'][number]['category'];
      count: number;
      total: number;
      labels: string[];
    }
  >();
  for (const seat of booking.seats) {
    const line = lines.get(seat.category) ?? {
      category: seat.category,
      count: 0,
      total: 0,
      labels: [],
    };
    line.count += 1;
    line.total += seat.price;
    line.labels.push(seat.label);
    lines.set(seat.category, line);
  }
  return [...lines.values()];
}

/** "Starts in 3h 20m" / "Starts in 45m" for a show later today; null otherwise. */
export function startsIn(booking: Booking, now: number | null): string | null {
  if (now === null) return null;
  const ms = Date.parse(booking.show.startsAt) - now;
  if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return null;
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Starts in ${h ? `${h}h ` : ''}${m}m`;
}
