import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { adminSystemAlert } from './messages';
import { NotificationsService } from './notifications.service';
import { ScheduledNotifications } from './scheduled-notifications';

/** Holds last minutes, so their warning has to be prompt. */
export const HOLD_WARNING_SWEEP_MS = 30_000;
export const SHOW_REMINDER_SWEEP_MS = 5 * 60_000;
export const RETENTION_SWEEP_MS = 6 * 60 * 60_000;

/**
 * Runs the clock-driven notifications. A failed run is logged, reported to the
 * admins (at most once per window, see ALERT_WINDOW_MS) and simply tried again
 * next time — every run is idempotent.
 */
@Injectable()
export class NotificationsJob {
  private readonly logger = new Logger('NotificationsJob');

  constructor(
    private readonly scheduled: ScheduledNotifications,
    private readonly notifications: NotificationsService,
  ) {}

  @Interval('notifications-hold-warnings', HOLD_WARNING_SWEEP_MS)
  holdWarnings(): Promise<void> {
    return this.run('hold warnings', () => this.scheduled.warnExpiringHolds());
  }

  @Interval('notifications-show-reminders', SHOW_REMINDER_SWEEP_MS)
  showReminders(): Promise<void> {
    return this.run('show reminders', () => this.scheduled.remindUpcomingShows());
  }

  @Interval('notifications-retention', RETENTION_SWEEP_MS)
  retention(): Promise<void> {
    return this.run('notification cleanup', () => this.scheduled.purgeOldRead());
  }

  private async run(job: string, work: () => Promise<number>): Promise<void> {
    try {
      const count = await work();
      if (count > 0) this.logger.log(`${job}: ${count}`);
    } catch (error) {
      this.logger.error(`${job} failed`, (error as Error).stack);
      await this.notifications.sendToAdmins(
        adminSystemAlert(job, (error as Error).message, new Date()),
      );
    }
  }
}
