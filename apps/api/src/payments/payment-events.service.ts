import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CURRENCY } from '@cineseat/shared';
import { bookingCode } from '../bookings/bookings.service';
import {
  InventoryLane,
  fromSqlTime,
  placeholders,
  sqlTime,
  type InventoryTx,
} from '../database/inventory-lane';
import { liveSeatLabels } from '../notifications/booking-seats';
import {
  ALERT_WINDOW_MS,
  adminCouponExhausted,
  adminPaymentAlert,
  adminRefundIssued,
  adminShowAlmostFull,
  adminShowSoldOut,
  bookingConfirmed,
  paymentFailed,
  refunded,
  type PaymentAlertKind,
} from '../notifications/messages';
import { notify, notifyAdmins } from '../notifications/notify';
import { MockEventSchema, type MockEvent } from './mock-event';
import { MockPaymentProvider } from './mock-payment-provider';

/** What applying an event did — logged, and returned to the gateway for debugging. */
export type EventOutcome = 'confirmed' | 'failed' | 'refunded' | 'duplicate' | 'ignored';

type PaymentRow = { id: string; bookingId: string; userId: string; status: string; amount: number };
type BookingRow = {
  id: string;
  userId: string;
  showId: string;
  status: string;
  couponId: string | null;
  title: string;
  startsAt: string;
  theater: string;
  screen: string;
  buyerEmail: string;
};

/** Admins hear when a show passes this share of its seats sold (and again when it sells out). */
export const ALMOST_FULL_RATIO = 0.9;

/**
 * Applies what the payment provider reports (POST /payments/webhook/mock).
 *
 * Idempotent: a payment settles once — SUCCESS, FAILED or REFUNDED — and later
 * events for it change nothing. Money is never kept without seats: a success
 * for a booking that is no longer waiting for it (its hold ended, or another
 * payment already paid it) is refunded on the spot.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger('PaymentEvents');
  /** The alert window each kind of rejection was last reported in — saves a write per rejected request. */
  private readonly alerted = new Map<PaymentAlertKind, number>();

  constructor(
    private readonly lane: InventoryLane,
    private readonly provider: MockPaymentProvider,
    private readonly config: ConfigService,
  ) {}

  async handleMockWebhook(
    body: Buffer | string | undefined,
    signature: string | undefined,
    now: Date = new Date(),
  ): Promise<{ received: true; outcome: EventOutcome }> {
    if (!body || !this.provider.verifyWebhook(signature, body, now)) {
      await this.alertAdmins('invalid-signature', now);
      throw new BadRequestException('Invalid webhook signature');
    }
    let event: MockEvent;
    try {
      event = MockEventSchema.parse(JSON.parse(body.toString()));
    } catch {
      await this.alertAdmins('malformed-event', now);
      throw new BadRequestException('Malformed webhook event');
    }
    let outcome: EventOutcome;
    try {
      outcome = await this.lane.run((tx) => this.apply(tx, event, now));
    } catch (error) {
      // `apply` rejects an event only for these two reasons; the alert is written
      // after its unit rolled back, in a unit of its own.
      if (error instanceof NotFoundException) await this.alertAdmins('unknown-payment', now);
      else if (error instanceof BadRequestException) await this.alertAdmins('amount-mismatch', now);
      throw error;
    }
    this.logger.log(`${event.type} for ${event.data.ref}: ${outcome}`);
    return { received: true, outcome };
  }

  /**
   * Tells the admins a signed-looking request was refused — at most once per kind
   * per ALERT_WINDOW_MS (the dedupe key holds across restarts, the map saves the
   * write in between). Never throws: the request is answered with its own error.
   */
  private async alertAdmins(kind: PaymentAlertKind, now: Date): Promise<void> {
    this.logger.warn(`Rejected a payment event: ${kind}`);
    const window = Math.floor(now.getTime() / ALERT_WINDOW_MS);
    if (this.alerted.get(kind) === window) return;
    this.alerted.set(kind, window);
    try {
      await this.lane.run((tx) => notifyAdmins(tx, now, adminPaymentAlert(kind, now)));
    } catch (error) {
      this.logger.warn(`Could not alert admins (${kind}): ${(error as Error).message}`);
    }
  }

  private apply(tx: InventoryTx, event: MockEvent, now: Date): EventOutcome {
    const payment = tx.get<PaymentRow>(
      `SELECT "id", "bookingId", "userId", "status", "amount" FROM "payments"
       WHERE "provider" = 'mock' AND "providerRef" = ?`,
      event.data.ref,
    );
    if (!payment) throw new NotFoundException('Unknown payment');
    if (payment.amount !== event.data.amount || event.data.currency !== CURRENCY) {
      throw new BadRequestException('The event does not match the payment amount');
    }
    if (payment.status === 'SUCCESS' || payment.status === 'REFUNDED') return 'duplicate';

    const at = sqlTime(now);
    const booking = tx.get<BookingRow>(
      `SELECT b."id", b."userId", b."showId", b."status", b."couponId", m."title", s."startsAt",
              t."name" AS "theater", sc."name" AS "screen", u."email" AS "buyerEmail"
       FROM "bookings" b
       JOIN "shows" s ON s."id" = b."showId"
       JOIN "movies" m ON m."id" = s."movieId"
       JOIN "screens" sc ON sc."id" = s."screenId"
       JOIN "theaters" t ON t."id" = sc."theaterId"
       JOIN "users" u ON u."id" = b."userId"
       WHERE b."id" = ?`,
      payment.bookingId,
    ) as BookingRow;

    if (event.type === 'payment.failed') {
      if (payment.status !== 'PENDING') return 'ignored';
      const reason = event.data.reason ?? 'The payment did not go through.';
      tx.run(
        `UPDATE "payments" SET "status" = 'FAILED', "failureReason" = ?, "method" = ?, "completedAt" = ?
         WHERE "id" = ?`,
        reason,
        event.data.method,
        at,
        payment.id,
      );
      // The hold stays: the buyer can try again until it runs out — and is told so,
      // in case they closed the payment page.
      const hold = tx.get<{ expiresAt: string | null }>(
        `SELECT "expiresAt" FROM "bookings" WHERE "id" = ? AND "status" = 'PENDING'`,
        booking.id,
      );
      const holdEndsAt = hold?.expiresAt ? fromSqlTime(hold.expiresAt) : null;
      notify(tx, now, {
        ...paymentFailed({
          paymentId: payment.id,
          bookingId: booking.id,
          title: booking.title,
          reason,
          holdEndsAt: holdEndsAt && holdEndsAt > now ? holdEndsAt : null,
          timeZone: this.timeZone,
        }),
        userId: payment.userId,
      });
      return 'failed';
    }

    if (payment.status === 'PENDING' && booking.status === 'PENDING') {
      const seats = tx.all<{ showSeatId: string; status: string; heldBy: string | null }>(
        `SELECT bs."showSeatId", ss."status", ss."heldBy" FROM "booking_seats" bs
         JOIN "show_seats" ss ON ss."id" = bs."showSeatId"
         WHERE bs."bookingId" = ? AND bs."releasedAt" IS NULL`,
        booking.id,
      );
      // A PENDING booking still holds its seats (taking them needs the hold to
      // end first, which ends the booking); checked anyway, never assumed.
      const intact =
        seats.length > 0 &&
        seats.every((seat) => seat.status === 'HELD' && seat.heldBy === booking.userId);
      if (intact) {
        this.confirm(
          tx,
          payment,
          booking,
          seats.map((seat) => seat.showSeatId),
          event,
          now,
        );
        return 'confirmed';
      }
    }

    const reason =
      booking.status === 'CONFIRMED'
        ? 'Refunded: this booking was already paid.'
        : 'Refunded: the seat hold had ended before the payment arrived.';
    tx.run(
      `UPDATE "payments" SET "status" = 'REFUNDED', "failureReason" = ?, "method" = ?, "completedAt" = ?
       WHERE "id" = ?`,
      reason,
      event.data.method,
      at,
      payment.id,
    );
    notify(tx, now, {
      ...refunded({ paymentId: payment.id, bookingId: booking.id, title: booking.title, reason }),
      userId: payment.userId,
    });
    // Money left automatically: the admins reconcile it.
    notifyAdmins(
      tx,
      now,
      adminRefundIssued({
        paymentId: payment.id,
        bookingId: booking.id,
        code: bookingCode(booking.id),
        title: booking.title,
        amount: payment.amount,
        reason,
        buyerEmail: booking.buyerEmail,
      }),
    );
    return 'refunded';
  }

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  private confirm(
    tx: InventoryTx,
    payment: PaymentRow,
    booking: BookingRow,
    showSeatIds: string[],
    event: MockEvent,
    now: Date,
  ): void {
    const at = sqlTime(now);
    tx.run(
      `UPDATE "show_seats" SET "status" = 'BOOKED', "heldBy" = NULL, "holdExpiresAt" = NULL
       WHERE "id" IN (${placeholders(showSeatIds.length)})`,
      ...showSeatIds,
    );
    tx.run(
      `UPDATE "payments" SET "status" = 'SUCCESS', "method" = ?, "completedAt" = ? WHERE "id" = ?`,
      event.data.method,
      at,
      payment.id,
    );
    // An older attempt still open at the gateway can no longer pay for this booking.
    tx.run(
      `UPDATE "payments" SET "status" = 'FAILED', "failureReason" = 'Another payment completed this booking.', "completedAt" = ?
       WHERE "bookingId" = ? AND "status" = 'PENDING'`,
      at,
      booking.id,
    );
    tx.run(
      `UPDATE "bookings" SET "status" = 'CONFIRMED', "expiresAt" = NULL, "updatedAt" = ? WHERE "id" = ?`,
      at,
      booking.id,
    );
    if (booking.couponId) {
      tx.run(`UPDATE "coupons" SET "usedCount" = "usedCount" + 1 WHERE "id" = ?`, booking.couponId);
      this.noticeCouponLimit(tx, booking.couponId, now);
    }

    const startsAt = fromSqlTime(booking.startsAt);
    notify(tx, now, {
      ...bookingConfirmed({
        bookingId: booking.id,
        title: booking.title,
        startsAt,
        theater: booking.theater,
        labels: liveSeatLabels(tx, booking.id),
        timeZone: this.timeZone,
      }),
      userId: booking.userId,
    });
    this.noticeShowFilling(tx, booking, startsAt, now);
  }

  /** Sold out, or past ALMOST_FULL_RATIO: the admins hear once per show and milestone. */
  private noticeShowFilling(tx: InventoryTx, booking: BookingRow, startsAt: Date, now: Date): void {
    const seats = tx.get<{ total: number; sold: number }>(
      `SELECT COUNT(*) AS "total", COALESCE(SUM("status" = 'BOOKED'), 0) AS "sold"
       FROM "show_seats" WHERE "showId" = ?`,
      booking.showId,
    );
    if (!seats || seats.total === 0) return;
    const facts = {
      showId: booking.showId,
      title: booking.title,
      startsAt,
      theater: booking.theater,
      screen: booking.screen,
      sold: seats.sold,
      total: seats.total,
      timeZone: this.timeZone,
    };
    if (seats.sold >= seats.total) notifyAdmins(tx, now, adminShowSoldOut(facts));
    else if (seats.sold / seats.total >= ALMOST_FULL_RATIO) {
      notifyAdmins(tx, now, adminShowAlmostFull(facts));
    }
  }

  /** An offer with a usage limit that was just reached: the admins hear once. */
  private noticeCouponLimit(tx: InventoryTx, couponId: string, now: Date): void {
    const coupon = tx.get<{ code: string; usageLimit: number | null; usedCount: number }>(
      `SELECT "code", "usageLimit", "usedCount" FROM "coupons" WHERE "id" = ?`,
      couponId,
    );
    if (coupon?.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      notifyAdmins(
        tx,
        now,
        adminCouponExhausted({ couponId, code: coupon.code, limit: coupon.usageLimit }),
      );
    }
  }
}
