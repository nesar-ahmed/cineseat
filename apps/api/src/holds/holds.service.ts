import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { MoreThan, type Repository } from 'typeorm';
import { CURRENCY, type CreateHoldInput, type Hold, type SeatCategory } from '@cineseat/shared';
import { Booking, BookingSeat, ShowSeat } from '../database/entities';
import { InventoryLane, fromSqlTime, placeholders, sqlTime } from '../database/inventory-lane';
import { seatPrice } from '../shows/pricing';
import { seatLabel } from '../theaters/seat-layout';
import { releaseExpiredHolds, releaseHolds } from './hold-release';

const MINUTE = 60_000;

/** A show seat as the hold reads it: its state and where it is. */
type SeatRow = { id: string; status: string; row: number; number: number; category: SeatCategory };

type LoadedHold = Booking & {
  seats: (BookingSeat & { showSeat: ShowSeat & { seat: NonNullable<ShowSeat['seat']> } })[];
};

/**
 * Seat holds. A hold is a PENDING booking: its seats read HELD to everyone else
 * until `expiresAt`, and an unpaid hold is then removed so they are back on sale.
 *
 * Rules: all requested seats are held or none is; one hold per buyer (a new one
 * replaces the last, so changing seats is just holding again); a hold never
 * outlives the show's start. Changes run as InventoryLane units of work; reads
 * use the repositories.
 */
@Injectable()
export class HoldsService {
  constructor(
    private readonly lane: InventoryLane,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly config: ConfigService,
  ) {}

  private get holdMinutes(): number {
    return this.config.getOrThrow<number>('holdMinutes');
  }

  /** POST /holds. 404 unknown show, 400 seats of another show, 409 started or seats taken. */
  async place(userId: string, input: CreateHoldInput, now: Date = new Date()): Promise<Hold> {
    const holdMs = this.holdMinutes * MINUTE;
    const id = await this.lane.run((tx) => {
      const show = tx.get<{ id: string; startsAt: string; basePrice: number }>(
        `SELECT "id", "startsAt", "basePrice" FROM "shows" WHERE "id" = ?`,
        input.showId,
      );
      if (!show) throw new NotFoundException('Show not found');
      const startsAt = fromSqlTime(show.startsAt);
      if (startsAt <= now) {
        throw new ConflictException('This show has started; tickets are no longer on sale.');
      }

      // Lapsed holds on this show and the buyer's previous hold make way first.
      // If the new seats turn out to be taken, the rollback restores the old hold.
      releaseExpiredHolds(tx, now, show.id);
      releaseHolds(tx, userId, now);

      const list = placeholders(input.seatIds.length);
      const seats = tx.all<SeatRow>(
        `SELECT ss."id", ss."status", s."row", s."number", s."category"
         FROM "show_seats" ss JOIN "seats" s ON s."id" = ss."seatId"
         WHERE ss."showId" = ? AND ss."id" IN (${list})`,
        show.id,
        ...input.seatIds,
      );
      if (seats.length !== input.seatIds.length) {
        throw new BadRequestException('seatIds: some of these seats are not in this show.');
      }
      const taken = seats.filter((seat) => seat.status !== 'AVAILABLE');
      if (taken.length > 0) throw new ConflictException(takenMessage(taken));

      const expiresAt = new Date(Math.min(now.getTime() + holdMs, startsAt.getTime()));
      const held = tx.run(
        `UPDATE "show_seats" SET "status" = 'HELD', "heldBy" = ?, "holdExpiresAt" = ?
         WHERE "showId" = ? AND "status" = 'AVAILABLE' AND "id" IN (${list})`,
        userId,
        sqlTime(expiresAt),
        show.id,
        ...input.seatIds,
      );
      // Nothing can change between the check above and this UPDATE (see
      // InventoryLane); its condition keeps "one seat, one buyer" true regardless.
      if (held !== seats.length) {
        throw new ConflictException('Some of these seats were just taken. Please pick again.');
      }

      const bookingId = randomUUID();
      const priced = seats.map((seat) => ({
        showSeatId: seat.id,
        price: seatPrice(show.basePrice, seat.category),
      }));
      tx.run(
        `INSERT INTO "bookings"
           ("id", "userId", "showId", "status", "totalAmount", "expiresAt", "createdAt", "updatedAt")
         VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
        bookingId,
        userId,
        show.id,
        priced.reduce((sum, seat) => sum + seat.price, 0),
        sqlTime(expiresAt),
        sqlTime(now),
        sqlTime(now),
      );
      for (const seat of priced) {
        tx.run(
          `INSERT INTO "booking_seats" ("id", "bookingId", "showSeatId", "price") VALUES (?, ?, ?, ?)`,
          randomUUID(),
          bookingId,
          seat.showSeatId,
          seat.price,
        );
      }
      return bookingId;
    });
    return this.findActive(userId, id, now);
  }

  /** GET /holds/current — the buyer's live hold, if any (there is at most one). */
  async current(userId: string, now: Date = new Date()): Promise<Hold> {
    const hold = await this.loadActive({ userId }, now);
    if (!hold) throw new NotFoundException('You have no seats on hold.');
    return toHold(hold);
  }

  /** GET /holds/:id — only the buyer's own, and only while it lasts. */
  async findActive(userId: string, id: string, now: Date = new Date()): Promise<Hold> {
    const hold = await this.loadActive({ userId, id }, now);
    if (!hold) throw new NotFoundException('This hold has expired or was released.');
    return toHold(hold);
  }

  /** DELETE /holds/:id — give the seats back before the time is up. */
  async release(userId: string, id: string, now: Date = new Date()): Promise<void> {
    const released = await this.lane.run((tx) => {
      const live = tx.get(
        `SELECT 1 FROM "bookings"
         WHERE "id" = ? AND "userId" = ? AND "status" = 'PENDING' AND "expiresAt" > ?`,
        id,
        userId,
        sqlTime(now),
      );
      return live ? releaseHolds(tx, userId, now, id) : 0;
    });
    if (released === 0) throw new NotFoundException('This hold has expired or was released.');
  }

  /** Removes every lapsed hold and puts its seats back on sale; returns how many went. */
  releaseExpired(now: Date = new Date()): Promise<number> {
    return this.lane.run((tx) => releaseExpiredHolds(tx, now));
  }

  private loadActive(where: { userId: string; id?: string }, now: Date) {
    return this.bookings.findOne({
      where: { ...where, status: 'PENDING', expiresAt: MoreThan(now) },
      relations: { seats: { showSeat: { seat: true } } },
      order: { createdAt: 'DESC' },
    }) as Promise<LoadedHold | null>;
  }
}

function takenMessage(seats: SeatRow[]): string {
  const labels = seats
    .map((seat) => seatLabel(seat.row, seat.number))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const list =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  return `${list} ${labels.length === 1 ? 'is' : 'are'} no longer available. Please pick other seats.`;
}

function toHold(booking: LoadedHold): Hold {
  const seats = [...booking.seats]
    .sort(
      (a, b) =>
        a.showSeat.seat.row - b.showSeat.seat.row ||
        a.showSeat.seat.number - b.showSeat.seat.number,
    )
    .map((item) => ({
      id: item.showSeatId,
      label: seatLabel(item.showSeat.seat.row, item.showSeat.seat.number),
      category: item.showSeat.seat.category as SeatCategory,
      price: item.price,
    }));
  return {
    id: booking.id,
    showId: booking.showId,
    createdAt: booking.createdAt.toISOString(),
    expiresAt: (booking.expiresAt as Date).toISOString(),
    currency: CURRENCY,
    // The seats' prices; an offer applied at checkout is in the booking, not the hold.
    totalAmount: seats.reduce((sum, seat) => sum + seat.price, 0),
    seats,
  };
}
