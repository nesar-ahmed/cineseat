import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsRelations, Repository } from 'typeorm';
import {
  CURRENCY,
  type Booking as BookingDto,
  type BookingListQuery,
  type BookingStatus,
  type Paginated,
  type PaymentStatus,
  type SeatCategory,
  type ShowFormat,
} from '@cineseat/shared';
import { dateInZone, timeInZone } from '../common/time/zoned-time';
import { Booking } from '../database/entities';
import { seatLabel } from '../theaters/seat-layout';

const RELATIONS: FindOptionsRelations<Booking> = {
  seats: { showSeat: { seat: true } },
  show: { movie: true, screen: { theater: true } },
  coupon: true,
  payments: true,
};

/** A buyer's bookings — holds being paid for, confirmed tickets, and ones that failed. */
@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly config: ConfigService,
  ) {}

  /** GET /bookings — newest first. */
  async list(userId: string, query: BookingListQuery): Promise<Paginated<BookingDto>> {
    const [rows, total] = await this.bookings.findAndCount({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** GET /bookings/:id — only its owner's. A hold that ran out unpaid no longer exists. */
  async findOne(userId: string, id: string): Promise<BookingDto> {
    const booking = await this.bookings.findOne({ where: { id, userId }, relations: RELATIONS });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.toDto(booking);
  }

  private toDto(booking: Booking): BookingDto {
    const timeZone = this.config.getOrThrow<string>('timeZone');
    const { show } = booking;
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
    const subtotal = seats.reduce((sum, seat) => sum + seat.price, 0);
    const payment =
      [...booking.payments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      null;

    return {
      id: booking.id,
      code: bookingCode(booking.id),
      status: booking.status as BookingStatus,
      createdAt: booking.createdAt.toISOString(),
      expiresAt: booking.status === 'PENDING' ? (booking.expiresAt?.toISOString() ?? null) : null,
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
      seats,
      currency: CURRENCY,
      subtotal,
      discount: Math.max(0, subtotal - booking.totalAmount),
      total: booking.totalAmount,
      coupon: booking.coupon
        ? { code: booking.coupon.code, description: booking.coupon.description }
        : null,
      payment: payment && {
        id: payment.id,
        status: payment.status as PaymentStatus,
        amount: payment.amount,
        method: payment.method,
        failureReason: payment.failureReason,
        createdAt: payment.createdAt.toISOString(),
        completedAt: payment.completedAt?.toISOString() ?? null,
      },
    };
  }
}

/** The short reference people read out at the counter: `CS-` and 8 characters of the id. */
export function bookingCode(id: string): string {
  return `CS-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
