import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bookingCode } from '../bookings/bookings.service';
import { InventoryLane, fromSqlTime, sqlTime } from '../database/inventory-lane';
import { liveSeatLabels } from './booking-seats';
import { holdExpiring, showReminder, type ReminderWindow } from './messages';
import { notify } from './notify';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A buyer is warned when this little time is left on their hold. */
export const HOLD_WARNING_MS = 2 * MINUTE;

/**
 * Show reminders, longest lead first. A booking gets a reminder only if it was
 * made before that reminder's time came (booking 3 hours ahead earns the 2-hour
 * one, not the day-before one), and each at most once.
 */
export const REMINDERS: { window: ReminderWindow; leadMs: number }[] = [
  { window: '24h', leadMs: DAY },
  { window: '2h', leadMs: 2 * HOUR },
];

/** Read notifications are removed after this long; unread ones are kept. */
export const READ_RETENTION_MS = 90 * DAY;

/**
 * Notifications that come from the clock rather than from a request. Each run
 * is one InventoryLane unit and safe to repeat: dedupe keys make a second run
 * (or two API instances) write nothing new.
 */
@Injectable()
export class ScheduledNotifications {
  constructor(
    private readonly lane: InventoryLane,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  /** Holds with at most HOLD_WARNING_MS left: "finish checkout by 7:42 PM". Returns how many were sent. */
  warnExpiringHolds(now: Date = new Date()): Promise<number> {
    return this.lane.run((tx) => {
      const holds = tx.all<{ id: string; userId: string; expiresAt: string; title: string }>(
        `SELECT b."id", b."userId", b."expiresAt", m."title"
         FROM "bookings" b
         JOIN "shows" s ON s."id" = b."showId"
         JOIN "movies" m ON m."id" = s."movieId"
         WHERE b."status" = 'PENDING' AND b."expiresAt" > ? AND b."expiresAt" <= ?`,
        sqlTime(now),
        sqlTime(new Date(now.getTime() + HOLD_WARNING_MS)),
      );
      let sent = 0;
      for (const hold of holds) {
        const message = holdExpiring({
          bookingId: hold.id,
          title: hold.title,
          labels: liveSeatLabels(tx, hold.id),
          expiresAt: fromSqlTime(hold.expiresAt),
          now,
          timeZone: this.timeZone,
        });
        if (notify(tx, now, { ...message, userId: hold.userId })) sent += 1;
      }
      return sent;
    });
  }

  /** Day-before and two-hours-before reminders for confirmed bookings. Returns how many were sent. */
  remindUpcomingShows(now: Date = new Date()): Promise<number> {
    return this.lane.run((tx) => {
      let sent = 0;
      REMINDERS.forEach(({ window, leadMs }, index) => {
        // Each window ends where the next, shorter one begins: a show 90 minutes
        // away gets the 2-hour reminder only, even if the job was down all day.
        const nextLeadMs = REMINDERS[index + 1]?.leadMs ?? 0;
        const bookings = tx.all<{
          id: string;
          userId: string;
          createdAt: string;
          startsAt: string;
          title: string;
          theater: string;
          screen: string;
        }>(
          `SELECT b."id", b."userId", b."createdAt", s."startsAt", m."title",
                  t."name" AS "theater", sc."name" AS "screen"
           FROM "bookings" b
           JOIN "shows" s ON s."id" = b."showId"
           JOIN "movies" m ON m."id" = s."movieId"
           JOIN "screens" sc ON sc."id" = s."screenId"
           JOIN "theaters" t ON t."id" = sc."theaterId"
           WHERE b."status" = 'CONFIRMED' AND s."startsAt" > ? AND s."startsAt" <= ?
             AND NOT EXISTS (
               SELECT 1 FROM "notifications" n
               WHERE n."userId" = b."userId" AND n."dedupeKey" = ? || b."id")`,
          sqlTime(new Date(now.getTime() + nextLeadMs)),
          sqlTime(new Date(now.getTime() + leadMs)),
          `show-reminder-${window}:`,
        );
        for (const booking of bookings) {
          const startsAt = fromSqlTime(booking.startsAt);
          if (fromSqlTime(booking.createdAt).getTime() > startsAt.getTime() - leadMs) continue;
          const message = showReminder({
            window,
            bookingId: booking.id,
            code: bookingCode(booking.id),
            title: booking.title,
            startsAt,
            theater: booking.theater,
            screen: booking.screen,
            labels: liveSeatLabels(tx, booking.id),
            timeZone: this.timeZone,
          });
          if (notify(tx, now, { ...message, userId: booking.userId })) sent += 1;
        }
      });
      return sent;
    });
  }

  /** Removes notifications read more than READ_RETENTION_MS ago. Returns how many. */
  purgeOldRead(now: Date = new Date()): Promise<number> {
    return this.lane.run((tx) =>
      tx.run(
        `DELETE FROM "notifications" WHERE "readAt" IS NOT NULL AND "readAt" < ?`,
        sqlTime(new Date(now.getTime() - READ_RETENTION_MS)),
      ),
    );
  }
}
