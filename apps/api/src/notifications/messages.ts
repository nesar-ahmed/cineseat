import { showTimeLabel } from '../common/time/zoned-time';
import type { NotificationMessage } from './notify';

/**
 * The wording of every in-app notification, in one place. Each function returns
 * what to say and what it is about; the caller decides who gets it, and writes it
 * in the same unit of work as the change it describes.
 *
 * Times are on the cinemas' clock (`TIME_ZONE`), money in poisha (৳1 = 100).
 */

const MINUTE = 60_000;

/** Throttled alerts: at most one per kind in each window of this length. */
export const ALERT_WINDOW_MS = 10 * MINUTE;

/** "৳600" or "৳1,250.50". */
export function taka(minor: number): string {
  const value = minor / 100;
  return `৳${value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "7:42 PM" on the cinemas' clock. */
export function clockLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    instant,
  );
}

const seats = (labels: string[]) => labels.join(', ');

/** A stored refund reason ("Refunded: the seat hold had ended…") as a sentence of its own. */
function refundReason(reason: string): string {
  const text = reason.replace(/^Refunded:\s*/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const alertWindow = (now: Date) => Math.floor(now.getTime() / ALERT_WINDOW_MS);

// --- Account --------------------------------------------------------------------

export function welcome(name: string): NotificationMessage {
  const first = name.trim().split(/\s+/)[0] || name;
  return {
    type: 'WELCOME',
    title: `Welcome to CineSeat, ${first}`,
    body: 'Your account is ready. Pick a movie and choose the exact seats you want — they are held for you while you pay.',
    dedupeKey: 'welcome',
  };
}

export function passwordChanged(): NotificationMessage {
  return {
    type: 'ACCOUNT_SECURITY',
    title: 'Your password was changed',
    body: "Your CineSeat password was just changed. If this wasn't you, change it again right away.",
  };
}

export function emailChanged(previous: string, next: string): NotificationMessage {
  return {
    type: 'ACCOUNT_SECURITY',
    title: 'Your sign-in email was changed',
    body: `You now sign in with ${next} instead of ${previous}. If this wasn't you, change your password right away.`,
  };
}

/** An admin changed the account's role: admin access given, or taken away. */
export function roleChanged(role: 'USER' | 'ADMIN'): NotificationMessage {
  return role === 'ADMIN'
    ? {
        type: 'ACCOUNT_SECURITY',
        title: 'You are now a CineSeat admin',
        body: 'An administrator gave your account access to the admin panel. You will find it in your account menu.',
      }
    : {
        type: 'ACCOUNT_SECURITY',
        title: 'Your admin access was removed',
        body: 'An administrator removed your access to the admin panel. Your account, bookings and tickets are unchanged.',
      };
}

// --- Holds, payments and bookings (buyers) ----------------------------------------

export function holdExpiring(args: {
  bookingId: string;
  title: string;
  labels: string[];
  expiresAt: Date;
  now: Date;
  timeZone: string;
}): NotificationMessage {
  const minutes = Math.max(1, Math.round((args.expiresAt.getTime() - args.now.getTime()) / MINUTE));
  return {
    type: 'HOLD_EXPIRING',
    title: 'Your seats are about to be released',
    body: `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left to pay for ${args.title} (seats ${seats(args.labels)}). Finish checkout by ${clockLabel(args.expiresAt, args.timeZone)} to keep them.`,
    bookingId: args.bookingId,
    // Starting to pay extends a hold once; the new deadline earns its own warning.
    dedupeKey: `hold-expiring:${args.bookingId}:${args.expiresAt.toISOString()}`,
  };
}

/** A hold nobody started paying for ran out: the booking is gone, so it links to the show. */
export function holdExpired(args: {
  showId: string;
  title: string;
  labels: string[];
  showStarted: boolean;
}): NotificationMessage {
  return {
    type: 'HOLD_EXPIRED',
    title: 'Your seats were released',
    body: args.showStarted
      ? `Your hold on seats ${seats(args.labels)} for ${args.title} ended when the show started, before checkout was finished.`
      : `Checkout for ${args.title} (seats ${seats(args.labels)}) wasn't finished in time, so the seats went back on sale. Pick seats again to book.`,
    showId: args.showId,
  };
}

/** Wording kept from the first release of the hold sweep. */
export function bookingFailed(args: { bookingId: string; title: string }): NotificationMessage {
  return {
    type: 'BOOKING_FAILED',
    title: 'Booking not completed',
    body: `Your seats for ${args.title} were released because the payment did not finish in time. If any money arrives for it, it is refunded automatically.`,
    bookingId: args.bookingId,
  };
}

export function paymentFailed(args: {
  paymentId: string;
  bookingId: string;
  title: string;
  reason: string;
  /** When the hold ends, if it is still live; null once it has ended. */
  holdEndsAt: Date | null;
  timeZone: string;
}): NotificationMessage {
  const reason = /[.!?]$/.test(args.reason) ? args.reason : `${args.reason}.`;
  return {
    type: 'PAYMENT_FAILED',
    title: 'Payment not completed',
    body: args.holdEndsAt
      ? `${reason} Your seats for ${args.title} stay held until ${clockLabel(args.holdEndsAt, args.timeZone)} — you can try again.`
      : `${reason} The seat hold for ${args.title} has ended.`,
    bookingId: args.bookingId,
    dedupeKey: `payment-failed:${args.paymentId}`,
  };
}

/** Wording kept from the first release of payments. */
export function bookingConfirmed(args: {
  bookingId: string;
  title: string;
  startsAt: Date;
  theater: string;
  labels: string[];
  timeZone: string;
}): NotificationMessage {
  return {
    type: 'BOOKING_CONFIRMED',
    title: 'Booking confirmed',
    body: `${args.title} · ${showTimeLabel(args.startsAt, args.timeZone)} · ${args.theater} · seats ${seats(args.labels)}`,
    bookingId: args.bookingId,
  };
}

/** `reason` is the payment's stored reason, which starts with "Refunded: ". */
export function refunded(args: {
  paymentId: string;
  bookingId: string;
  title: string;
  reason: string;
}): NotificationMessage {
  return {
    type: 'REFUNDED',
    title: 'Payment refunded',
    body: `${refundReason(args.reason)} The full amount for ${args.title} is on its way back to you.`,
    bookingId: args.bookingId,
    dedupeKey: `refund:${args.paymentId}`,
  };
}

export type ReminderWindow = '24h' | '2h';

export function showReminder(args: {
  window: ReminderWindow;
  bookingId: string;
  code: string;
  title: string;
  startsAt: Date;
  theater: string;
  screen: string;
  labels: string[];
  timeZone: string;
}): NotificationMessage {
  return {
    type: 'SHOW_REMINDER',
    title:
      args.window === '2h' ? `${args.title} starts soon` : `Your show is coming up: ${args.title}`,
    body: `${showTimeLabel(args.startsAt, args.timeZone)} · ${args.theater}, ${args.screen} · seats ${seats(args.labels)}. Arrive 15 minutes early and show booking code ${args.code} at the entrance.`,
    bookingId: args.bookingId,
    dedupeKey: `show-reminder-${args.window}:${args.bookingId}`,
  };
}

export function announcement(title: string, body: string): NotificationMessage {
  return { type: 'ANNOUNCEMENT', title, body };
}

// --- Admins ------------------------------------------------------------------------

export function adminNewUser(user: {
  id: string;
  name: string;
  email: string;
}): NotificationMessage {
  return {
    type: 'ADMIN_NEW_USER',
    title: `New sign-up: ${user.name}`,
    body: `${user.name} (${user.email}) created an account.`,
    subjectUserId: user.id,
    dedupeKey: `new-user:${user.id}`,
  };
}

export function adminRefundIssued(args: {
  paymentId: string;
  bookingId: string;
  code: string;
  title: string;
  amount: number;
  reason: string;
  buyerEmail: string;
}): NotificationMessage {
  return {
    type: 'ADMIN_REFUND_ISSUED',
    title: `Refund issued: ${taka(args.amount)}`,
    body: `${args.code} · ${args.title} · ${args.buyerEmail}. ${refundReason(args.reason)}`,
    bookingId: args.bookingId,
    dedupeKey: `refund:${args.paymentId}`,
  };
}

type ShowFacts = {
  showId: string;
  title: string;
  startsAt: Date;
  theater: string;
  screen: string;
  sold: number;
  total: number;
  timeZone: string;
};

const showLine = (show: ShowFacts) =>
  `${show.title} · ${showTimeLabel(show.startsAt, show.timeZone)} · ${show.theater}, ${show.screen}`;

export function adminShowAlmostFull(show: ShowFacts): NotificationMessage {
  const percent = Math.floor((show.sold / show.total) * 100);
  return {
    type: 'ADMIN_SHOW_ALMOST_FULL',
    title: `Almost full: ${show.title}`,
    body: `${showLine(show)} — ${show.sold} of ${show.total} seats sold (${percent}%).`,
    showId: show.showId,
    dedupeKey: `show-almost-full:${show.showId}`,
  };
}

export function adminShowSoldOut(show: ShowFacts): NotificationMessage {
  return {
    type: 'ADMIN_SHOW_SOLD_OUT',
    title: `Sold out: ${show.title}`,
    body: `${showLine(show)} — all ${show.total} seats sold.`,
    showId: show.showId,
    dedupeKey: `show-sold-out:${show.showId}`,
  };
}

export function adminCouponExhausted(args: {
  couponId: string;
  code: string;
  limit: number;
}): NotificationMessage {
  return {
    type: 'ADMIN_COUPON_EXHAUSTED',
    title: `Offer used up: ${args.code}`,
    body: `${args.code} has reached its limit of ${args.limit} ${args.limit === 1 ? 'use' : 'uses'} and no longer applies at checkout.`,
    couponCode: args.code,
    dedupeKey: `coupon-exhausted:${args.couponId}`,
  };
}

export type PaymentAlertKind =
  'invalid-signature' | 'malformed-event' | 'unknown-payment' | 'amount-mismatch';

const PAYMENT_ALERT_TEXT: Record<PaymentAlertKind, string> = {
  'invalid-signature': 'its signature did not verify',
  'malformed-event': 'its body was not a valid payment event',
  'unknown-payment': 'it named a payment CineSeat never opened',
  'amount-mismatch': 'its amount or currency did not match the payment',
};

/** Throttled: one per kind per window, however many requests are rejected. */
export function adminPaymentAlert(kind: PaymentAlertKind, now: Date): NotificationMessage {
  return {
    type: 'ADMIN_PAYMENT_ALERT',
    title: 'Payment webhook rejected',
    body: `A payment event was rejected because ${PAYMENT_ALERT_TEXT[kind]}. Nothing was changed. Further rejections of this kind in the next ${ALERT_WINDOW_MS / MINUTE} minutes are only logged.`,
    dedupeKey: `payment-alert:${kind}:${alertWindow(now)}`,
  };
}

/** Throttled: one per job per window. */
export function adminSystemAlert(job: string, detail: string, now: Date): NotificationMessage {
  return {
    type: 'ADMIN_SYSTEM_ALERT',
    title: `Background job failed: ${job}`,
    body: `${detail.slice(0, 300)} It runs again automatically; check the API log if this repeats.`,
    dedupeKey: `system-alert:${job}:${alertWindow(now)}`,
  };
}
