import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type FindOptionsRelations, type Repository } from 'typeorm';
import {
  CURRENCY,
  type BookingStatus,
  type Invoice,
  type InvoiceLine,
  type InvoiceListQuery,
  type InvoiceSeller,
  type InvoiceStatus,
  type InvoiceSummary,
  type Paginated,
  type PaymentStatus,
  type SeatCategory,
  type ShowFormat,
} from '@cineseat/shared';
import { dateInZone, timeInZone } from '../common/time/zoned-time';
import { Booking, Payment } from '../database/entities';
import { seatLabel } from '../theaters/seat-layout';
import { bookingCode } from '../bookings/bookings.service';

const RELATIONS: FindOptionsRelations<Booking> = {
  user: true,
  seats: { showSeat: { seat: true } },
  show: { movie: true, screen: { theater: true } },
  coupon: true,
  payments: true,
};

/** Payment states that mean money moved, so there is something to bill. */
const SETTLED = ['SUCCESS', 'REFUNDED'] as const;

const CATEGORY_LABEL: Record<SeatCategory, string> = {
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
  RECLINER: 'Recliner',
};

/**
 * Invoices for the seats a buyer paid for.
 *
 * An invoice is derived from its booking rather than stored: every amount it
 * bills is already an immutable snapshot (each seat's price at booking time,
 * and the booking's total), and the booking code comes from the booking id, so
 * the same booking always produces the same invoice. Nothing is written here —
 * the service only reads.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly config: ConfigService,
  ) {}

  /** GET /invoices — the buyer's invoices, newest settlement first. */
  async list(userId: string, query: InvoiceListQuery): Promise<Paginated<InvoiceSummary>> {
    const [{ total }] = (await this.bookings.query(
      `SELECT COUNT(*) AS total FROM (${SETTLED_BOOKINGS}) AS invoices`,
      this.filters(userId, query.status),
    )) as { total: number }[];

    const rows = (await this.bookings.query(
      `${SETTLED_BOOKINGS} ORDER BY "issuedAt" DESC, "createdAt" DESC LIMIT ? OFFSET ?`,
      [...this.filters(userId, query.status), query.pageSize, (query.page - 1) * query.pageSize],
    )) as { id: string }[];

    // One query for the page's bookings, then map in the order the SQL chose.
    const byId = new Map(
      rows.length === 0
        ? []
        : (
            await this.bookings.find({
              where: { id: In(rows.map((row) => row.id)) },
              relations: RELATIONS,
            })
          ).map((booking) => [booking.id, booking] as const),
    );

    return {
      items: rows.flatMap((row) => {
        const booking = byId.get(row.id);
        return booking ? [this.toSummary(booking)] : [];
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** GET /invoices/:id — one invoice, by the id of the booking it bills. */
  async findOne(userId: string, id: string): Promise<Invoice> {
    const booking = await this.bookings.findOne({ where: { id, userId }, relations: RELATIONS });
    // Same answer for "not yours" and "not invoiced": neither is the caller's business.
    if (!booking || !settlingPayment(booking.payments)) {
      throw new NotFoundException('Invoice not found');
    }
    return this.toInvoice(booking);
  }

  /* ------------------------------------------------------------ mapping */

  private toSummary(booking: Booking): InvoiceSummary {
    const { show } = booking;
    return {
      ...this.common(booking),
      movieId: show.movie.id,
      movieTitle: show.movie.title,
      showStartsAt: show.startsAt.toISOString(),
      theaterName: show.screen.theater.name,
    };
  }

  private toInvoice(booking: Booking): Invoice {
    const timeZone = this.config.getOrThrow<string>('timeZone');
    const { show, user } = booking;
    const settled = settlingPayment(booking.payments)!;
    const common = this.common(booking);
    const refunds = booking.payments
      .filter((payment) => payment.status === 'REFUNDED')
      .sort(byCompletion)
      .map((payment) => ({
        amount: payment.amount,
        reason: payment.failureReason,
        refundedAt: payment.completedAt?.toISOString() ?? null,
      }));

    return {
      ...common,
      seller: this.config.getOrThrow<InvoiceSeller>('invoiceSeller'),
      buyer: { name: user.name, email: user.email, phone: user.phone ?? null },
      show: {
        id: show.id,
        startsAt: show.startsAt.toISOString(),
        date: dateInZone(show.startsAt, timeZone),
        time: timeInZone(show.startsAt, timeZone),
        format: show.format as ShowFormat,
        language: show.language,
        movie: {
          id: show.movie.id,
          title: show.movie.title,
          certificate: show.movie.certificate,
          durationMin: show.movie.durationMin,
        },
        theater: {
          id: show.screen.theater.id,
          name: show.screen.theater.name,
          city: show.screen.theater.city,
          address: show.screen.theater.address,
        },
        screen: { id: show.screen.id, name: show.screen.name },
      },
      lines: chargeLines(booking),
      coupon: booking.coupon
        ? { code: booking.coupon.code, description: booking.coupon.description }
        : null,
      refunds,
      payment: {
        provider: settled.provider,
        reference: settled.providerRef,
        method: settled.method,
        status: settled.status as PaymentStatus,
        paidAt: settled.completedAt?.toISOString() ?? null,
      },
      notes: this.notes(common.status, refunds.length > 0),
    };
  }

  /** Everything a listed and an opened invoice say alike. */
  private common(booking: Booking) {
    const timeZone = this.config.getOrThrow<string>('timeZone');
    const settled = settlingPayment(booking.payments)!;
    const issuedAt = settled.completedAt ?? settled.createdAt;
    const code = bookingCode(booking.id);
    const subtotal = booking.seats.reduce((sum, seat) => sum + seat.price, 0);
    const paid = sum(booking.payments, 'SUCCESS');

    return {
      id: booking.id,
      // Year on the cinemas' clock, like every other date the API reports.
      number: `INV-${dateInZone(issuedAt, timeZone).slice(0, 4)}-${code.replace(/^CS-/, '')}`,
      issuedAt: issuedAt.toISOString(),
      status: (settled.status === 'SUCCESS' ? 'PAID' : 'REFUNDED') as InvoiceStatus,
      currency: CURRENCY,
      subtotal,
      discount: Math.max(0, subtotal - booking.totalAmount),
      total: booking.totalAmount,
      amountPaid: paid,
      amountRefunded: sum(booking.payments, 'REFUNDED'),
      bookingId: booking.id,
      bookingCode: code,
      bookingStatus: booking.status as BookingStatus,
      seatCount: booking.seats.length,
      paymentMethod: settled.method,
    };
  }

  private notes(status: InvoiceStatus, refunded: boolean): string[] {
    const notes = ['Prices are in BDT and include all applicable taxes.'];
    if (status === 'REFUNDED') {
      notes.push('This payment arrived after the seat hold ended, so it was refunded in full.');
    } else if (refunded) {
      notes.push('A further payment for this booking was received and refunded in full.');
    }
    if (this.config.get<string>('paymentProvider') === 'mock') {
      notes.push('Test mode: payments are simulated and no money changed hands.');
    }
    return notes;
  }

  /** `userId` and, when asked, the status — in the order `SETTLED_BOOKINGS` binds them. */
  private filters(userId: string, status: InvoiceListQuery['status']): unknown[] {
    return [userId, status ?? '', status ?? ''];
  }
}

/**
 * The bookings of one buyer that have an invoice, with the date their money
 * settled. `?2`/`?3` carry the status filter: empty means "any".
 *
 * PAID is a booking with a successful payment; REFUNDED is one where money
 * arrived but only ever went back. A booking that was paid and later received a
 * second, refunded payment stays PAID — it is billed by its successful one.
 */
const SETTLED_BOOKINGS = `
  SELECT b."id" AS "id",
         b."createdAt" AS "createdAt",
         COALESCE(
           MAX(CASE WHEN p."status" = 'SUCCESS' THEN p."completedAt" END),
           MAX(p."completedAt"),
           MAX(p."createdAt")
         ) AS "issuedAt"
  FROM "bookings" b
  JOIN "payments" p ON p."bookingId" = b."id" AND p."status" IN ('SUCCESS', 'REFUNDED')
  WHERE b."userId" = ?
  GROUP BY b."id", b."createdAt"
  HAVING (? = '' OR ? = CASE WHEN SUM(p."status" = 'SUCCESS') > 0 THEN 'PAID' ELSE 'REFUNDED' END)
`;

/**
 * The payment an invoice bills: the successful one, or the refunded one when a
 * booking was never paid (the money arrived too late and went straight back).
 */
function settlingPayment(payments: Payment[]): Payment | null {
  const settled = payments.filter((payment) =>
    (SETTLED as readonly string[]).includes(payment.status),
  );
  return (
    settled.find((payment) => payment.status === 'SUCCESS') ?? settled.sort(byCompletion)[0] ?? null
  );
}

/** Newest settlement first. */
function byCompletion(a: Payment, b: Payment): number {
  return (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime();
}

function sum(payments: Payment[], status: PaymentStatus): number {
  return payments
    .filter((payment) => payment.status === status)
    .reduce((total, payment) => total + payment.amount, 0);
}

/** Seats become charge lines: one per category and price, in row order. */
function chargeLines(booking: Booking): InvoiceLine[] {
  const seats = [...booking.seats].sort(
    (a, b) =>
      a.showSeat.seat.row - b.showSeat.seat.row || a.showSeat.seat.number - b.showSeat.seat.number,
  );
  const lines = new Map<string, InvoiceLine>();
  for (const seat of seats) {
    const category = seat.showSeat.seat.category as SeatCategory;
    const key = `${category}:${seat.price}`;
    const line = lines.get(key) ?? {
      description: `${CATEGORY_LABEL[category]} seat`,
      category,
      seats: [],
      quantity: 0,
      unitPrice: seat.price,
      amount: 0,
    };
    line.seats.push(seatLabel(seat.showSeat.seat.row, seat.showSeat.seat.number));
    line.quantity += 1;
    line.amount += seat.price;
    lines.set(key, line);
  }
  return [...lines.values()];
}
