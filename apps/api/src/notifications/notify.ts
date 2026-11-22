import { randomUUID } from 'node:crypto';
import type { AnnouncementAudience, NotificationType } from '@cineseat/shared';
import { sqlTime, type InventoryTx } from '../database/inventory-lane';

/** What a notification says, and what it is about. */
export type NotificationMessage = {
  type: NotificationType;
  title: string;
  body: string;
  bookingId?: string | null;
  showId?: string | null;
  couponCode?: string | null;
  /** The account the message is about (a new sign-up), when that is not its recipient. */
  subjectUserId?: string | null;
  /**
   * Same key, same account: written once (later attempts are skipped). Timed
   * jobs and throttled alerts use it, so running twice never repeats a message.
   */
  dedupeKey?: string | null;
};

/**
 * Adds an in-app notification inside an InventoryLane unit, so it is written
 * exactly when the change it describes is (and rolled back with it).
 * Returns false when a notification with the same `dedupeKey` already exists.
 */
export function notify(
  tx: InventoryTx,
  now: Date,
  message: NotificationMessage & { userId: string },
): boolean {
  return (
    tx.run(
      `INSERT INTO "notifications"
         ("id", "userId", "type", "title", "body", "bookingId", "showId", "couponCode", "subjectUserId", "dedupeKey", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT ("userId", "dedupeKey") DO NOTHING`,
      randomUUID(),
      message.userId,
      message.type,
      message.title,
      message.body,
      message.bookingId ?? null,
      message.showId ?? null,
      message.couponCode ?? null,
      message.subjectUserId ?? null,
      message.dedupeKey ?? null,
      sqlTime(now),
    ) === 1
  );
}

/** Sends the same message to every account of the audience; returns how many got it. */
export function notifyAudience(
  tx: InventoryTx,
  now: Date,
  audience: AnnouncementAudience,
  message: NotificationMessage,
): number {
  const where =
    audience === 'ADMINS'
      ? `WHERE "role" = 'ADMIN'`
      : audience === 'USERS'
        ? `WHERE "role" = 'USER'`
        : '';
  const recipients = tx.all<{ id: string }>(`SELECT "id" FROM "users" ${where}`);
  let sent = 0;
  for (const { id } of recipients) {
    if (notify(tx, now, { ...message, userId: id })) sent += 1;
  }
  return sent;
}

/** Sends the message to every ADMIN account (one copy each, so each has its own read state). */
export function notifyAdmins(tx: InventoryTx, now: Date, message: NotificationMessage): number {
  return notifyAudience(tx, now, 'ADMINS', message);
}
