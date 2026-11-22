import type { ComponentType, SVGProps } from 'react';
import type { NotificationType } from '@cineseat/shared';
import {
  BellIcon,
  CalendarIcon,
  ClockIcon,
  CloseIcon,
  InfoIcon,
  LockIcon,
  PercentIcon,
  ReceiptIcon,
  SeatIcon,
  ShieldIcon,
  SparklesIcon,
  TicketIcon,
  UserIcon,
} from '../../components/ui/icons';
import { ACCOUNT_ROUTES } from '../account/links';
import {
  ADMIN_ROUTES,
  adminBookingHref,
  adminOfferHref,
  adminShowHref,
  adminUserHref,
} from '../admin/links';
import { bookingHref } from '../bookings/queries';
import type { AppNotification } from './types';

type Tone = 'emerald' | 'gold' | 'brand' | 'muted';

type Kind = {
  /** Short tag above the title — the category, since API titles already say what happened. */
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: Tone;
  /** Needs the user soon (a hold about to lapse): drawn with more weight. */
  urgent?: boolean;
  /** The card's one call to action, if the message has a next step. */
  action?: (notification: AppNotification) => { label: string; href: string };
};

/** A booking's own page when the notification says which; the tickets list otherwise. */
const toBooking = (label: string) => (n: AppNotification) => ({
  label,
  href: n.bookingId ? bookingHref(n.bookingId) : ACCOUNT_ROUTES.tickets,
});

/**
 * Presentation of every `NotificationType` (packages/shared/src/enums.ts). Which
 * list filter a type belongs to is the API's `NOTIFICATION_CATEGORY`, not this
 * table. BOOKING_CANCELLED and NEW_COUPON are defined but not sent yet (their
 * features are not built). The ADMIN_* types appear only in the admin panel.
 */
export const KINDS: Record<NotificationType, Kind> = {
  BOOKING_CONFIRMED: {
    label: 'Booking',
    icon: TicketIcon,
    tone: 'emerald',
    action: toBooking('View ticket'),
  },
  SHOW_REMINDER: {
    label: 'Reminder',
    icon: CalendarIcon,
    tone: 'gold',
    action: toBooking('View ticket'),
  },
  HOLD_EXPIRING: {
    label: 'Action needed',
    icon: ClockIcon,
    tone: 'gold',
    urgent: true,
    action: (n) => ({
      label: 'Finish payment',
      href: n.bookingId ? `/checkout/${encodeURIComponent(n.bookingId)}` : ACCOUNT_ROUTES.tickets,
    }),
  },
  HOLD_EXPIRED: {
    label: 'Seats released',
    icon: SeatIcon,
    tone: 'muted',
    // The unpaid hold is gone: back to the show's seat map to pick again.
    action: (n) => ({
      label: 'Pick seats again',
      href: n.showId ? `/shows/${encodeURIComponent(n.showId)}/seats` : '/movies',
    }),
  },
  PAYMENT_FAILED: {
    label: 'Payment',
    icon: ReceiptIcon,
    tone: 'gold',
    urgent: true,
    action: (n) => ({
      label: 'Try again',
      href: n.bookingId ? `/checkout/${encodeURIComponent(n.bookingId)}` : ACCOUNT_ROUTES.tickets,
    }),
  },
  BOOKING_FAILED: {
    label: 'Booking',
    icon: InfoIcon,
    tone: 'muted',
    action: toBooking('View details'),
  },
  BOOKING_CANCELLED: {
    label: 'Booking',
    icon: CloseIcon,
    tone: 'muted',
    action: toBooking('View details'),
  },
  REFUNDED: {
    label: 'Payment',
    icon: ReceiptIcon,
    tone: 'emerald',
    action: toBooking('View booking'),
  },
  NEW_COUPON: {
    label: 'Offer',
    icon: PercentIcon,
    tone: 'brand',
    action: () => ({ label: 'Browse movies', href: '/movies' }),
  },
  ANNOUNCEMENT: {
    label: 'News',
    icon: BellIcon,
    tone: 'brand',
  },
  WELCOME: {
    label: 'Welcome',
    icon: SparklesIcon,
    tone: 'brand',
    action: () => ({ label: 'Browse movies', href: '/movies' }),
  },
  ACCOUNT_SECURITY: {
    label: 'Security',
    icon: LockIcon,
    tone: 'gold',
    action: () => ({ label: 'Change password', href: ACCOUNT_ROUTES.password }),
  },
  // Admin panel only. Each links to where the admin acts on it — pages that are
  // not built yet keep their address (see features/admin/links.ts).
  ADMIN_NEW_USER: {
    label: 'New user',
    icon: UserIcon,
    tone: 'brand',
    action: (n) => ({
      label: 'View user',
      href: n.subjectUserId ? adminUserHref(n.subjectUserId) : ADMIN_ROUTES.users,
    }),
  },
  ADMIN_REFUND_ISSUED: {
    label: 'Refund',
    icon: ReceiptIcon,
    tone: 'gold',
    action: (n) => ({
      label: 'View payment',
      href: n.bookingId ? adminBookingHref(n.bookingId, 'payments') : ADMIN_ROUTES.payments,
    }),
  },
  ADMIN_SHOW_ALMOST_FULL: {
    label: 'Sales',
    icon: SeatIcon,
    tone: 'emerald',
    action: (n) => ({
      label: 'View show',
      href: n.showId ? adminShowHref(n.showId) : ADMIN_ROUTES.shows,
    }),
  },
  ADMIN_SHOW_SOLD_OUT: {
    label: 'Sold out',
    icon: TicketIcon,
    tone: 'emerald',
    action: (n) => ({
      label: 'View show',
      href: n.showId ? adminShowHref(n.showId) : ADMIN_ROUTES.shows,
    }),
  },
  ADMIN_COUPON_EXHAUSTED: {
    label: 'Offer',
    icon: PercentIcon,
    tone: 'muted',
    action: (n) => ({
      label: 'Manage offer',
      href: n.couponCode ? adminOfferHref(n.couponCode) : ADMIN_ROUTES.offers,
    }),
  },
  ADMIN_PAYMENT_ALERT: {
    label: 'Payment alert',
    icon: ShieldIcon,
    tone: 'gold',
    urgent: true,
    action: () => ({ label: 'Review payments', href: ADMIN_ROUTES.payments }),
  },
  // Nothing to open: the message says what failed, the API log has the rest.
  ADMIN_SYSTEM_ALERT: { label: 'System alert', icon: InfoIcon, tone: 'gold', urgent: true },
};

export const TONE_TILE: Record<Tone, string> = {
  emerald: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30',
  gold: 'bg-gold-400/15 text-gold-200 ring-gold-400/30',
  brand: 'bg-brand-500/15 text-brand-200 ring-brand-500/30',
  muted: 'bg-white/[0.06] text-ink-200 ring-white/15',
};

export const TONE_LABEL: Record<Tone, string> = {
  emerald: 'text-emerald-300',
  gold: 'text-gold-300',
  brand: 'text-brand-300',
  muted: 'text-ink-400',
};
