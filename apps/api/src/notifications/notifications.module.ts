import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../database/entities';
import { NotificationsController } from './notifications.controller';
import { NotificationsJob } from './notifications.job';
import { NotificationsService } from './notifications.service';
import { ScheduledNotifications } from './scheduled-notifications';

/**
 * In-app notifications: the API (`/notifications`), sending for code outside an
 * InventoryLane unit (exported), and the clock-driven ones (hold warnings, show
 * reminders, cleanup). Seat and payment code writes its own with `notify()`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [NotificationsService, ScheduledNotifications, NotificationsJob],
  exports: [NotificationsService],
})
export class NotificationsModule {}
