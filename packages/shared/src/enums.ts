/**
 * Domain enums as const objects.
 * SQLite has no native enums, so statuses are stored as strings and
 * validated with these Zod enums (see the guideline, section 7).
 */
import { z } from 'zod';

export const UserRole = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRole>;

export const MovieStatus = z.enum(['NOW_SHOWING', 'COMING_SOON']);
export type MovieStatus = z.infer<typeof MovieStatus>;

export const ShowFormat = z.enum(['2D', '3D']);
export type ShowFormat = z.infer<typeof ShowFormat>;

/** Film certificate: U (all ages), U/A (parental guidance under 12), A (adults only). */
export const Certificate = z.enum(['U', 'U/A', 'A']);
export type Certificate = z.infer<typeof Certificate>;

export const SeatCategory = z.enum(['STANDARD', 'PREMIUM', 'RECLINER']);
export type SeatCategory = z.infer<typeof SeatCategory>;

export const ShowSeatStatus = z.enum(['AVAILABLE', 'HELD', 'BOOKED']);
export type ShowSeatStatus = z.infer<typeof ShowSeatStatus>;

export const BookingStatus = z.enum(['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED']);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const PaymentStatus = z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const CouponType = z.enum(['PERCENT', 'FLAT']);
export type CouponType = z.infer<typeof CouponType>;

/**
 * What a notification is about. The first group goes to buyers, the `ADMIN_*`
 * group only to ADMIN accounts (one row per admin, so each has their own read
 * state). Presentation per type lives in the web app; the category each type
 * belongs to is `NOTIFICATION_CATEGORY` in ./notifications.ts.
 */
export const NotificationType = z.enum([
  // Buyers: bookings, holds and payments
  'BOOKING_CONFIRMED',
  'BOOKING_FAILED',
  'BOOKING_CANCELLED',
  'REFUNDED',
  'HOLD_EXPIRING',
  'HOLD_EXPIRED',
  'PAYMENT_FAILED',
  'SHOW_REMINDER',
  // Buyers: offers and news
  'ANNOUNCEMENT',
  'NEW_COUPON',
  // Buyers: their account
  'WELCOME',
  'ACCOUNT_SECURITY',
  // Admins
  'ADMIN_NEW_USER',
  'ADMIN_REFUND_ISSUED',
  'ADMIN_SHOW_ALMOST_FULL',
  'ADMIN_SHOW_SOLD_OUT',
  'ADMIN_COUPON_EXHAUSTED',
  'ADMIN_PAYMENT_ALERT',
  'ADMIN_SYSTEM_ALERT',
]);
export type NotificationType = z.infer<typeof NotificationType>;
