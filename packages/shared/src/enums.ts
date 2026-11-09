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

export const NotificationType = z.enum([
  'BOOKING_CONFIRMED',
  'BOOKING_FAILED',
  'BOOKING_CANCELLED',
  'REFUNDED',
  'HOLD_EXPIRING',
  'SHOW_REMINDER',
  'ANNOUNCEMENT',
  'NEW_COUPON',
]);
export type NotificationType = z.infer<typeof NotificationType>;
