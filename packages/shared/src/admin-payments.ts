import { z } from 'zod';
import { SortOrder } from './admin-common';
import { AdminPaymentSchema } from './admin-bookings';
import { csvList, ListQuerySchema, paginatedSchema } from './common';
import { BookingStatus, PaymentStatus } from './enums';
import { CalendarDateSchema } from './movies';

/**
 * The payments module of the admin panel (ADMIN only), read-only:
 * GET /admin/payments lists every payment attempt, for reconciliation — what
 * came in, what went back, what failed and why. A payment's full story is on
 * its booking (GET /admin/bookings/:id). Payments change only through the
 * provider's webhook. Money is in poisha (৳1 = 100); instants are ISO UTC.
 */

/** How the buyer paid, from what the provider reported ("Visa •••• 4242", "bKash 017•••••678"). */
export const PaymentChannel = z.enum(['CARD', 'BKASH', 'NAGAD']);
export type PaymentChannel = z.infer<typeof PaymentChannel>;

export const AdminPaymentSort = z.enum(['created', 'completed', 'amount']);
export type AdminPaymentSort = z.infer<typeof AdminPaymentSort>;

/**
 * GET /admin/payments. `search` matches the provider's reference, a booking
 * code (`CS-…` or its start), the buyer's name or email, or an exact payment
 * or booking id. Days are cinema days, on when the attempt started.
 */
export const AdminPaymentListQuerySchema = ListQuerySchema.extend({
  status: csvList(PaymentStatus),
  channel: csvList(PaymentChannel),
  user: csvList(z.string().trim().min(1).max(64)),
  from: CalendarDateSchema.optional(),
  to: CalendarDateSchema.optional(),
  /** Minor units, inclusive. */
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional(),
  sort: AdminPaymentSort.default('created'),
  /** Defaults to `desc` (newest, largest first). */
  order: SortOrder.optional(),
})
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'from must not be after to',
    path: ['from'],
  })
  .refine(
    (q) => q.minAmount === undefined || q.maxAmount === undefined || q.minAmount <= q.maxAmount,
    {
      message: 'minAmount must not be more than maxAmount',
      path: ['minAmount'],
    },
  );
export type AdminPaymentListQuery = z.infer<typeof AdminPaymentListQuerySchema>;

/** A payment attempt with what it was for and who made it. */
export const AdminPaymentRowSchema = AdminPaymentSchema.extend({
  /** Null until the provider says how the buyer paid. */
  channel: PaymentChannel.nullable(),
  booking: z.object({ id: z.string(), code: z.string(), status: BookingStatus }),
  buyer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  show: z.object({
    id: z.string(),
    startsAt: z.string(),
    date: z.string(),
    time: z.string(),
    movie: z.object({
      id: z.string(),
      title: z.string(),
      genre: z.string(),
      posterPath: z.string().nullable(),
    }),
    theater: z.object({ id: z.string(), name: z.string() }),
  }),
});
export type AdminPaymentRow = z.infer<typeof AdminPaymentRowSchema>;

/**
 * GET /admin/payments answer: a page; attempts per status with every other
 * filter applied (status tabs); and the money in what the filters select.
 */
export const AdminPaymentListSchema = paginatedSchema(AdminPaymentRowSchema).extend({
  counts: z.object({
    all: z.number().int().min(0),
    PENDING: z.number().int().min(0),
    SUCCESS: z.number().int().min(0),
    FAILED: z.number().int().min(0),
    REFUNDED: z.number().int().min(0),
  }),
  totals: z.object({
    /** Successful payments. */
    collected: z.number().int().min(0),
    /** Sent back (late or duplicate money). */
    refunded: z.number().int().min(0),
    /** What failed attempts would have been. */
    failed: z.number().int().min(0),
    /** Still open at the provider. */
    open: z.number().int().min(0),
  }),
});
export type AdminPaymentList = z.infer<typeof AdminPaymentListSchema>;
