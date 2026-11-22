import type { AdminBooking, BookingStatus, PaymentStatus } from '@cineseat/shared';
import { Badge, type BadgeTone } from '../ui/bits';

/**
 * How a booking reads to an admin. A PENDING booking is a seat hold waiting
 * for its money — until its time runs out; after that it is over even before
 * the expiry job has tidied it up, so it reads "Hold ended".
 */
export type BookingState = BookingStatus | 'LAPSED';

export function bookingState(
  booking: Pick<AdminBooking, 'status' | 'expiresAt'>,
  now: number | null,
): BookingState {
  if (
    booking.status === 'PENDING' &&
    booking.expiresAt &&
    now !== null &&
    Date.parse(booking.expiresAt) <= now
  )
    return 'LAPSED';
  return booking.status;
}

export const BOOKING_STATE: Record<BookingState, { label: string; tone: BadgeTone; hint: string }> =
  {
    CONFIRMED: { label: 'Paid', tone: 'green', hint: 'Paid — the seats are sold.' },
    PENDING: { label: 'Paying', tone: 'gold', hint: 'Seats on hold while the buyer pays.' },
    LAPSED: {
      label: 'Hold ended',
      tone: 'gray',
      hint: 'The hold ran out before a payment completed.',
    },
    FAILED: {
      label: 'Not completed',
      tone: 'rose',
      hint: 'The hold ended without a completed payment; the seats went back on sale.',
    },
    CANCELLED: {
      label: 'Cancelled',
      tone: 'gray',
      hint: 'Cancelled; the seats went back on sale.',
    },
  };

export function BookingBadge({ state }: { state: BookingState }) {
  return <Badge tone={BOOKING_STATE[state].tone}>{BOOKING_STATE[state].label}</Badge>;
}

export const PAYMENT_STATE: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  SUCCESS: { label: 'Paid', tone: 'green' },
  PENDING: { label: 'Open', tone: 'gold' },
  FAILED: { label: 'Failed', tone: 'rose' },
  REFUNDED: { label: 'Refunded', tone: 'blue' },
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_STATE[status].tone}>{PAYMENT_STATE[status].label}</Badge>;
}

/** "A1, A2, B4" — or "A1, A2 +5 more" when long. */
export function seatList(labels: string[], max = 4): string {
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max} more`;
}
