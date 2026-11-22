import { z } from 'zod';
import { SortOrder } from './admin-common';
import { csvList, ListQuerySchema, paginatedSchema } from './common';
import { BookingStatus, PaymentStatus, SeatCategory, ShowFormat } from './enums';
import { CalendarDateSchema } from './movies';

/**
 * The bookings module of the admin panel (ADMIN only), read-only:
 * GET /admin/bookings (every booking of every buyer) and GET /admin/bookings/:id
 * (one booking with its seats, price, buyer and every payment attempt).
 *
 * Bookings change only through the booking flow (hold → pay → webhook); the
 * admin panel reads them. Money is in poisha (৳1 = 100); instants are ISO UTC;
 * `date`/`time` are on the cinemas' clock.
 */

export const AdminBookingSort = z.enum(['created', 'showtime', 'amount', 'seats']);
export type AdminBookingSort = z.infer<typeof AdminBookingSort>;

/** Newest bookings first, latest shows first, biggest first. */
export function defaultBookingSortOrder(_sort: AdminBookingSort): SortOrder {
  return 'desc';
}

/**
 * GET /admin/bookings. Options inside one list are OR-ed, filters are AND-ed.
 * `search` matches a booking code (`CS-8607F6A2`, or just its first characters),
 * the buyer's name or email, the movie, or an exact booking id.
 */
export const AdminBookingListQuerySchema = ListQuerySchema.extend({
  status: csvList(BookingStatus),
  /** Has at least one payment in any of these states (e.g. REFUNDED: money went back). */
  payment: csvList(PaymentStatus),
  movie: csvList(z.string().trim().min(1).max(64)),
  theater: csvList(z.string().trim().min(1).max(64)),
  show: csvList(z.string().trim().min(1).max(64)),
  /** A buyer's account id. */
  user: csvList(z.string().trim().min(1).max(64)),
  /** Offer codes used (case-insensitive). */
  coupon: csvList(z.string().trim().min(1).max(32)),
  /** Booked on or after / on or before these cinema days. */
  bookedFrom: CalendarDateSchema.optional(),
  bookedTo: CalendarDateSchema.optional(),
  /** The show is on or after / on or before these cinema days. */
  showFrom: CalendarDateSchema.optional(),
  showTo: CalendarDateSchema.optional(),
  sort: AdminBookingSort.default('created'),
  order: SortOrder.optional(),
})
  .refine((q) => !q.bookedFrom || !q.bookedTo || q.bookedFrom <= q.bookedTo, {
    message: 'bookedFrom must not be after bookedTo',
    path: ['bookedFrom'],
  })
  .refine((q) => !q.showFrom || !q.showTo || q.showFrom <= q.showTo, {
    message: 'showFrom must not be after showTo',
    path: ['showFrom'],
  });
export type AdminBookingListQuery = z.infer<typeof AdminBookingListQuerySchema>;

export const AdminBookingShowSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  date: z.string(),
  time: z.string(),
  format: ShowFormat,
  language: z.string(),
  movie: z.object({
    id: z.string(),
    title: z.string(),
    genre: z.string(),
    posterPath: z.string().nullable(),
  }),
  theater: z.object({ id: z.string(), name: z.string(), city: z.string() }),
  screen: z.object({ id: z.string(), name: z.string() }),
});
export type AdminBookingShow = z.infer<typeof AdminBookingShowSchema>;

/**
 * A booking as the admin panel lists it. `seats` are its seat labels — the
 * live ones, or for a booking that ended without tickets the ones it held.
 * `paid` is what successful payments brought in; `refunded` what went back
 * (late or duplicate money). `payment` is the latest attempt, if any.
 */
export const AdminBookingSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: BookingStatus,
  createdAt: z.string(),
  /** While PENDING: when the hold lapses. */
  expiresAt: z.string().nullable(),
  buyer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  show: AdminBookingShowSchema,
  seats: z.array(z.string()),
  currency: z.string(),
  total: z.number().int().min(0),
  discount: z.number().int().min(0),
  couponCode: z.string().nullable(),
  paid: z.number().int().min(0),
  refunded: z.number().int().min(0),
  payment: z
    .object({
      status: PaymentStatus,
      method: z.string().nullable(),
      /** Every attempt, this one included. */
      attempts: z.number().int().min(1),
    })
    .nullable(),
});
export type AdminBooking = z.infer<typeof AdminBookingSchema>;

/**
 * GET /admin/bookings answer: a page; bookings per status with every other
 * filter applied (for status tabs); and totals of what the filters select.
 */
export const AdminBookingListSchema = paginatedSchema(AdminBookingSchema).extend({
  counts: z.object({
    all: z.number().int().min(0),
    PENDING: z.number().int().min(0),
    CONFIRMED: z.number().int().min(0),
    FAILED: z.number().int().min(0),
    CANCELLED: z.number().int().min(0),
  }),
  totals: z.object({
    /** Seats in these bookings that are still theirs (sold, or held while paying). */
    seats: z.number().int().min(0),
    paid: z.number().int().min(0),
    refunded: z.number().int().min(0),
  }),
});
export type AdminBookingList = z.infer<typeof AdminBookingListSchema>;

/** One payment attempt, as the provider left it. */
export const AdminPaymentSchema = z.object({
  id: z.string(),
  provider: z.string(),
  /** The provider's reference (the mock gateway's session). */
  providerRef: z.string(),
  status: PaymentStatus,
  amount: z.number().int().min(0),
  method: z.string().nullable(),
  /** Why it failed or was refunded, in the words the buyer saw. */
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AdminPayment = z.infer<typeof AdminPaymentSchema>;

/** GET /admin/bookings/:id */
export const AdminBookingDetailSchema = AdminBookingSchema.omit({ seats: true }).extend({
  /** Every seat the booking priced; `released` ones went back on sale (a hold that ended). */
  seats: z.array(
    z.object({
      label: z.string(),
      category: SeatCategory,
      price: z.number().int().min(0),
      released: z.boolean(),
    }),
  ),
  subtotal: z.number().int().min(0),
  coupon: z.object({ code: z.string(), description: z.string().nullable() }).nullable(),
  /** Every payment attempt, newest first. */
  payments: z.array(AdminPaymentSchema),
  buyer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    /** When the account was created. */
    since: z.string(),
    /** The buyer's paid bookings, this one included if paid. */
    paidBookings: z.number().int().min(0),
    /** What the buyer has paid in all (successful payments). */
    spent: z.number().int().min(0),
  }),
  updatedAt: z.string(),
});
export type AdminBookingDetail = z.infer<typeof AdminBookingDetailSchema>;
