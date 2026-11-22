import { z } from 'zod';
import { ListQuerySchema, paginatedSchema } from './common';
import { BookingStatus, PaymentStatus, SeatCategory, ShowFormat } from './enums';
import { HoldSeatSchema } from './holds';

/**
 * Checkout works on a hold (see holds.ts): price it, optionally with an offer
 * code, then start a payment. Payments are simulated — the only provider is
 * `mock`, a test gateway that never touches real money or real cards.
 */

/** Offer codes are matched case-insensitively; stored upper-case. */
const CouponCode = z
  .string()
  .trim()
  .min(3, 'Enter an offer code')
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Offer codes use letters and digits only')
  .transform((code) => code.toUpperCase());

/** Body of POST /checkout/:holdId/quote and /pay. Without a code, no discount. */
export const CheckoutInputSchema = z.object({
  couponCode: CouponCode.optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInputSchema>;

export const AppliedCouponSchema = z.object({
  code: z.string(),
  description: z.string().nullable(),
});
export type AppliedCoupon = z.infer<typeof AppliedCouponSchema>;

/** Money in minor units of `currency`: `total = subtotal - discount`. */
export const PriceSchema = z.object({
  currency: z.string(),
  subtotal: z.number().int().min(0),
  discount: z.number().int().min(0),
  total: z.number().int().min(0),
  coupon: AppliedCouponSchema.nullable(),
});
export type Price = z.infer<typeof PriceSchema>;

/** POST /checkout/:holdId/quote — what the buyer would pay right now. */
export const CheckoutQuoteSchema = PriceSchema.extend({
  holdId: z.string(),
  /** When the hold lapses (ISO, UTC). */
  expiresAt: z.string(),
});
export type CheckoutQuote = z.infer<typeof CheckoutQuoteSchema>;

export const PaymentProvider = z.enum(['mock']);
export type PaymentProvider = z.infer<typeof PaymentProvider>;

/**
 * POST /checkout/:holdId/pay — a payment waiting at the provider. Send the buyer
 * to `redirectUrl`; the provider reports the outcome to the API, and the booking
 * turns CONFIRMED (poll GET /bookings/:id). The hold is extended to `expiresAt`
 * so the seats stay put while the buyer pays.
 */
export const PaymentSessionSchema = z.object({
  paymentId: z.string(),
  bookingId: z.string(),
  provider: PaymentProvider,
  status: PaymentStatus,
  amount: z.number().int().min(0),
  currency: z.string(),
  redirectUrl: z.string(),
  expiresAt: z.string(),
});
export type PaymentSession = z.infer<typeof PaymentSessionSchema>;

export const BookingPaymentSchema = z.object({
  id: z.string(),
  status: PaymentStatus,
  amount: z.number().int().min(0),
  /** "Visa •••• 4242", once the provider says how the buyer paid. */
  method: z.string().nullable(),
  /** Why it failed or was refunded, in words a buyer can read. */
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type BookingPayment = z.infer<typeof BookingPaymentSchema>;

export const BookingShowSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  /** The cinema's calendar day and clock (`YYYY-MM-DD`, `HH:MM`). */
  date: z.string(),
  time: z.string(),
  format: ShowFormat,
  language: z.string(),
  movie: z.object({
    id: z.string(),
    title: z.string(),
    certificate: z.string(),
    durationMin: z.number().int().positive(),
  }),
  theater: z.object({ id: z.string(), name: z.string(), city: z.string(), address: z.string() }),
  screen: z.object({ id: z.string(), name: z.string() }),
});
export type BookingShow = z.infer<typeof BookingShowSchema>;

/**
 * A booking as its owner sees it. PENDING: seats on hold, not paid yet (until
 * `expiresAt`). CONFIRMED: paid, seats sold. FAILED: the hold ended without a
 * completed payment — any money that arrived late is refunded.
 */
export const BookingSchema = PriceSchema.extend({
  id: z.string(),
  /** Short reference for the cinema counter, e.g. `CS-8607F6A2`. */
  code: z.string(),
  status: BookingStatus,
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  show: BookingShowSchema,
  seats: z.array(HoldSeatSchema.extend({ category: SeatCategory })),
  /** The latest payment attempt, if any. */
  payment: BookingPaymentSchema.nullable(),
});
export type Booking = z.infer<typeof BookingSchema>;

export const PaginatedBookingsSchema = paginatedSchema(BookingSchema);

/** GET /bookings — the signed-in buyer's bookings, newest first. */
export const BookingListQuerySchema = ListQuerySchema.omit({ search: true }).extend({
  status: BookingStatus.optional(),
});
export type BookingListQuery = z.infer<typeof BookingListQuerySchema>;
