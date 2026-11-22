import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../database/entities';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

/** Invoices are read from bookings and their payments; nothing of their own is stored. */
@Module({
  imports: [TypeOrmModule.forFeature([Booking])],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
