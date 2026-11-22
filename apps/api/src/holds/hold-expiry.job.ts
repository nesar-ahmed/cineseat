import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { adminSystemAlert } from '../notifications/messages';
import { NotificationsService } from '../notifications/notifications.service';
import { HoldsService } from './holds.service';

/** How often lapsed holds are cleared out. */
export const HOLD_SWEEP_MS = 30_000;

/**
 * Removes holds whose time ran out and puts their seats back on sale.
 *
 * Nothing waits for this job: seat maps and new holds already treat a lapsed
 * hold as free seats the instant it expires. The sweep makes the database say
 * so too, so unpaid holds do not pile up and admins can change the show again.
 */
@Injectable()
export class HoldExpiryJob {
  private readonly logger = new Logger('HoldExpiry');

  constructor(
    private readonly holds: HoldsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Interval('hold-expiry', HOLD_SWEEP_MS)
  async sweep(): Promise<void> {
    try {
      const released = await this.holds.releaseExpired();
      if (released > 0) {
        this.logger.log(`Released ${released} lapsed ${released === 1 ? 'hold' : 'holds'}`);
      }
    } catch (error) {
      // The next run tries again; a failed sweep never blocks bookings.
      this.logger.error('Could not release lapsed holds', (error as Error).stack);
      // Seats stay blocked in the database until it works again: the admins should know.
      await this.notifications.sendToAdmins(
        adminSystemAlert('seat-hold cleanup', (error as Error).message, new Date()),
      );
    }
  }
}
