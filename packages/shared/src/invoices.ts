import { z } from 'zod';
import { AppliedCouponSchema, BookingShowSchema, type Booking } from './checkout';
import { ListQuerySchema, paginatedSchema, type Paginated } from './common';
import { BookingStatus, PaymentStatus, SeatCategory } from './enums';

/**
 * Invoices (guideline section 2.1: one contract for both apps).
 *
 * An invoice is the bill for one booking, and exists as soon as money moved:
 * the booking has a payment that ended as SUCCESS (status `PAID`) or, when the
 * hold had already ended, as REFUNDED (status `REFUNDED`). Bookings still
 * waiting for payment, and ones no money ever reached, have none.
 *
 * It is derived from the booking, not stored separately: the amounts it bills
 * are already immutable snapshots (each seat's price at booking time and the
 * booking's total), so the same booking always produces the same invoice.
 */

export const InvoiceStatus = z.enum(['PAID', 'REFUNDED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

/** Who issued the invoice — the cinema company, the same on every invoice. */
export const InvoiceSellerSchema = z.object({
  name: z.string(),
  addressLines: z.array(z.string()),
  city: z.string(),
  country: z.string(),
  email: z.string(),
  website: z.string(),
});
export type InvoiceSeller = z.infer<typeof InvoiceSellerSchema>;

/** Who it is billed to: the account that paid. */
export const InvoiceBuyerSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
});
export type InvoiceBuyer = z.infer<typeof InvoiceBuyerSchema>;

/** One charge line: the seats of a category that cost the same, e.g. "2 × Premium". */
export const InvoiceLineSchema = z.object({
  description: z.string(),
  category: SeatCategory,
  /** Seat labels on this line, in row order: `["E1", "E7"]`. */
  seats: z.array(z.string()),
  quantity: z.number().int().positive(),
  /** Minor units, per seat. */
  unitPrice: z.number().int().min(0),
  /** `quantity × unitPrice`, minor units. */
  amount: z.number().int().min(0),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

/** Money sent back: a late payment, or a second payment for an already paid booking. */
export const InvoiceRefundSchema = z.object({
  amount: z.number().int().min(0),
  reason: z.string().nullable(),
  refundedAt: z.string().nullable(),
});
export type InvoiceRefund = z.infer<typeof InvoiceRefundSchema>;

export const InvoicePaymentSchema = z.object({
  provider: z.string(),
  /** The provider's own reference for the payment. */
  reference: z.string(),
  method: z.string().nullable(),
  status: PaymentStatus,
  paidAt: z.string().nullable(),
});
export type InvoicePayment = z.infer<typeof InvoicePaymentSchema>;

/** What an invoice says, whether listed or opened on its own. */
const InvoiceBaseSchema = z.object({
  /** Same id as the booking it bills, so `/invoices/:id` and `/bookings/:id` agree. */
  id: z.string(),
  /** Human reference: `INV-2026-040ED9C1`, stable for a booking. */
  number: z.string(),
  /** When the money settled (the payment's completion), ISO UTC. */
  issuedAt: z.string(),
  status: InvoiceStatus,
  currency: z.string(),
  subtotal: z.number().int().min(0),
  discount: z.number().int().min(0),
  /** What was charged: `subtotal - discount`. */
  total: z.number().int().min(0),
  /** Of `total`, what the buyer actually paid (0 once everything came back). */
  amountPaid: z.number().int().min(0),
  amountRefunded: z.number().int().min(0),
  bookingId: z.string(),
  bookingCode: z.string(),
  bookingStatus: BookingStatus,
  seatCount: z.number().int().positive(),
  paymentMethod: z.string().nullable(),
});

/** A row of the invoices list: enough to recognise and open it. */
export const InvoiceSummarySchema = InvoiceBaseSchema.extend({
  movieId: z.string(),
  movieTitle: z.string(),
  showStartsAt: z.string(),
  theaterName: z.string(),
});
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

/** The whole invoice, as printed. */
export const InvoiceSchema = InvoiceBaseSchema.extend({
  seller: InvoiceSellerSchema,
  buyer: InvoiceBuyerSchema,
  show: BookingShowSchema,
  lines: z.array(InvoiceLineSchema),
  coupon: AppliedCouponSchema.nullable(),
  refunds: z.array(InvoiceRefundSchema),
  payment: InvoicePaymentSchema,
  /** Lines of small print: test-mode payments, refunds, what the price includes. */
  notes: z.array(z.string()),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaginatedInvoicesSchema = paginatedSchema(InvoiceSummarySchema);
export type PaginatedInvoices = Paginated<InvoiceSummary>;

/** GET /invoices — the signed-in buyer's invoices, newest settled first. */
export const InvoiceListQuerySchema = ListQuerySchema.omit({ search: true }).extend({
  status: InvoiceStatus.optional(),
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;

/**
 * Whether a booking has an invoice — money moved. Lets the ticket page decide
 * whether to link to one without asking the API first (the rule lives here, so
 * both apps apply the same one).
 */
export function hasInvoice(booking: Pick<Booking, 'payment'>): boolean {
  const status = booking.payment?.status;
  return status === 'SUCCESS' || status === 'REFUNDED';
}
