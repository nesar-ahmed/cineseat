import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  CURRENCY,
  type CheckoutInput,
  type CheckoutQuote,
  type PaymentSession,
} from '@cineseat/shared';
import { dateInZone } from '../common/time/zoned-time';
import { InventoryLane, fromSqlTime, sqlTime, type InventoryTx } from '../database/inventory-lane';
import { MockPaymentProvider } from '../payments/mock-payment-provider';
import { evaluateCoupon, type CouponRule } from './coupons';

const MINUTE = 60_000;

type LiveHold = {
  id: string;
  userId: string;
  couponId: string | null;
  createdAt: Date;
  expiresAt: Date;
  startsAt: Date;
};

type Priced = {
  subtotal: number;
  discount: number;
  total: number;
  coupon: { id: string; code: string; description: string | null } | null;
};

/**
 * Checkout for a seat hold: price it (with an offer code or without), then
 * start a payment with the provider — the mock gateway; nothing real is charged.
 *
 * Prices are always computed here from the held seats, never taken from the
 * client. Starting to pay extends the hold once, by PAYMENT_WINDOW_MINUTES, so
 * the seats cannot slip away while the buyer is on the payment page.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly lane: InventoryLane,
    private readonly provider: MockPaymentProvider,
    private readonly config: ConfigService,
  ) {}

  /** POST /checkout/:holdId/quote — 400 when the offer code does not apply. */
  quote(
    userId: string,
    holdId: string,
    input: CheckoutInput,
    now: Date = new Date(),
  ): Promise<CheckoutQuote> {
    return this.lane.run((tx) => {
      const hold = liveHold(tx, userId, holdId, now);
      const price = this.price(tx, hold, input.couponCode, now);
      return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), ...toPrice(price) };
    });
  }

  /**
   * POST /checkout/:holdId/pay. Asking again while a payment is open returns the
   * same payment (a double click never opens two); a changed price — a different
   * code — closes the open one and starts a new one.
   */
  async pay(
    userId: string,
    holdId: string,
    input: CheckoutInput,
    now: Date = new Date(),
  ): Promise<PaymentSession> {
    const holdMs = this.config.getOrThrow<number>('holdMinutes') * MINUTE;
    const windowMs = this.config.getOrThrow<number>('paymentWindowMinutes') * MINUTE;
    const at = sqlTime(now);

    const started = await this.lane.run((tx) => {
      const hold = liveHold(tx, userId, holdId, now);
      if (hold.startsAt <= now) {
        throw new ConflictException('This show has started; tickets are no longer on sale.');
      }
      const price = this.price(tx, hold, input.couponCode, now);
      const couponId = price.coupon?.id ?? null;

      const open = tx.get<{ id: string; providerRef: string; amount: number }>(
        `SELECT "id", "providerRef", "amount" FROM "payments"
         WHERE "bookingId" = ? AND "status" = 'PENDING' ORDER BY "createdAt" DESC LIMIT 1`,
        hold.id,
      );
      let payment: { id: string; ref: string };
      if (open && open.amount === price.total && hold.couponId === couponId) {
        payment = { id: open.id, ref: open.providerRef };
      } else {
        if (open) {
          tx.run(
            `UPDATE "payments" SET "status" = 'FAILED', "failureReason" = 'Replaced by a newer payment attempt.', "completedAt" = ?
             WHERE "bookingId" = ? AND "status" = 'PENDING'`,
            at,
            hold.id,
          );
        }
        payment = { id: randomUUID(), ref: this.provider.newReference() };
        tx.run(
          `INSERT INTO "payments" ("id", "bookingId", "provider", "providerRef", "status", "amount", "userId", "createdAt")
           VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
          payment.id,
          hold.id,
          this.provider.name,
          payment.ref,
          price.total,
          userId,
          at,
        );
      }

      // One payment window on top of the hold, however often the buyer retries,
      // and never past the show's start.
      const expiresAt = new Date(
        Math.min(
          Math.max(hold.expiresAt.getTime(), now.getTime() + windowMs),
          hold.createdAt.getTime() + holdMs + windowMs,
          hold.startsAt.getTime(),
        ),
      );
      tx.run(
        `UPDATE "bookings" SET "couponId" = ?, "totalAmount" = ?, "expiresAt" = ?, "updatedAt" = ? WHERE "id" = ?`,
        couponId,
        price.total,
        sqlTime(expiresAt),
        at,
        hold.id,
      );
      tx.run(
        `UPDATE "show_seats" SET "holdExpiresAt" = ?
         WHERE "status" = 'HELD' AND "heldBy" = ?
           AND "id" IN (SELECT "showSeatId" FROM "booking_seats" WHERE "bookingId" = ? AND "releasedAt" IS NULL)`,
        sqlTime(expiresAt),
        userId,
        hold.id,
      );
      return { ...payment, amount: price.total, expiresAt };
    });

    return {
      paymentId: started.id,
      bookingId: holdId,
      provider: this.provider.name,
      status: 'PENDING',
      amount: started.amount,
      currency: CURRENCY,
      redirectUrl: this.provider.paymentPageUrl(started.ref),
      expiresAt: started.expiresAt.toISOString(),
    };
  }

  private price(tx: InventoryTx, hold: LiveHold, code: string | undefined, now: Date): Priced {
    const seats = tx.get<{ subtotal: number; count: number }>(
      `SELECT COALESCE(SUM("price"), 0) AS "subtotal", COUNT(*) AS "count"
       FROM "booking_seats" WHERE "bookingId" = ? AND "releasedAt" IS NULL`,
      hold.id,
    ) ?? { subtotal: 0, count: 0 };
    if (!code)
      return { subtotal: seats.subtotal, discount: 0, total: seats.subtotal, coupon: null };

    const row = tx.get<
      Omit<CouponRule, 'validFrom' | 'validTo' | 'firstBookingOnly'> & {
        validFrom: string;
        validTo: string;
        firstBookingOnly: number;
      }
    >(`SELECT * FROM "coupons" WHERE "code" = ?`, code);
    const coupon: CouponRule | undefined = row && {
      ...row,
      validFrom: fromSqlTime(row.validFrom),
      validTo: fromSqlTime(row.validTo),
      firstBookingOnly: Boolean(row.firstBookingOnly),
    };
    const confirmed = tx.get<{ count: number }>(
      `SELECT COUNT(*) AS "count" FROM "bookings" WHERE "userId" = ? AND "status" = 'CONFIRMED'`,
      hold.userId,
    );
    const result = evaluateCoupon(coupon, code, {
      now,
      subtotal: seats.subtotal,
      seatCount: seats.count,
      showDate: dateInZone(hold.startsAt, this.config.getOrThrow<string>('timeZone')),
      confirmedBookings: confirmed?.count ?? 0,
    });
    if (!result.ok) throw new BadRequestException(`couponCode: ${result.reason}`);
    return {
      subtotal: seats.subtotal,
      discount: result.discount,
      total: seats.subtotal - result.discount,
      coupon: { id: coupon!.id, code: coupon!.code, description: coupon!.description },
    };
  }
}

/** The buyer's hold, still running — or the reason checkout cannot go on. */
function liveHold(tx: InventoryTx, userId: string, holdId: string, now: Date): LiveHold {
  const row = tx.get<{
    id: string;
    userId: string;
    status: string;
    couponId: string | null;
    createdAt: string;
    expiresAt: string | null;
    startsAt: string;
  }>(
    `SELECT b."id", b."userId", b."status", b."couponId", b."createdAt", b."expiresAt", s."startsAt"
     FROM "bookings" b JOIN "shows" s ON s."id" = b."showId" WHERE b."id" = ?`,
    holdId,
  );
  if (!row || row.userId !== userId) throw new NotFoundException('No hold with this id.');
  if (row.status === 'CONFIRMED') throw new ConflictException('This booking is already paid.');
  if (row.status !== 'PENDING' || !row.expiresAt || fromSqlTime(row.expiresAt) <= now) {
    throw new GoneException('Your seat hold has ended. Please pick your seats again.');
  }
  return {
    id: row.id,
    userId: row.userId,
    couponId: row.couponId,
    createdAt: fromSqlTime(row.createdAt),
    expiresAt: fromSqlTime(row.expiresAt),
    startsAt: fromSqlTime(row.startsAt),
  };
}

function toPrice(price: Priced) {
  return {
    currency: CURRENCY,
    subtotal: price.subtotal,
    discount: price.discount,
    total: price.total,
    coupon: price.coupon && { code: price.coupon.code, description: price.coupon.description },
  };
}
