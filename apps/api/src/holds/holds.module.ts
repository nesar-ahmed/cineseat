import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { HoldExpiryJob } from './hold-expiry.job';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';

/** Seat holds: reserve seats for checkout, release them, and clear out the ones that lapse. */
@Module({
  imports: [TypeOrmModule.forFeature([Booking]), NotificationsModule],
  controllers: [HoldsController],
  providers: [HoldsService, HoldExpiryJob],
  exports: [HoldsService],
})
export class HoldsModule {}
