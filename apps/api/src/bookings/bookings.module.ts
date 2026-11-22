import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../database/entities';
import { PaymentsModule } from '../payments/payments.module';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminBookingsService } from './admin-bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

/**
 * Checkout (price, offer codes, start paying), the buyer's bookings, and every
 * buyer's bookings for the admin panel (`/admin/bookings`, read-only).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Booking]), PaymentsModule],
  controllers: [CheckoutController, BookingsController, AdminBookingsController],
  providers: [CheckoutService, BookingsService, AdminBookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
