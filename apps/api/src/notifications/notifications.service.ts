import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, IsNull, Not, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  NOTIFICATION_CATEGORY,
  NotificationCategory,
  NotificationType,
  notificationTypesIn,
  type AnnouncementResult,
  type CreateAnnouncementInput,
  type Notification as NotificationDto,
  type NotificationCounts,
  type NotificationListQuery,
  type Paginated,
  type ReadAllResult,
  type UnreadCount,
} from '@cineseat/shared';
import { Notification } from '../database/entities';
import { InventoryLane, sqlTime, type InventoryTx } from '../database/inventory-lane';
import { adminNewUser, announcement, welcome } from './messages';
import { notify, notifyAdmins, notifyAudience, type NotificationMessage } from './notify';

/**
 * In-app notifications: the signed-in account's own list (read, unread, remove),
 * admin announcements, and sending for code that runs outside an InventoryLane
 * unit (signup, account settings, background jobs).
 *
 * Code that changes seats or payments does not come here: it calls `notify()`
 * inside its own lane unit, so the message commits or rolls back with the change.
 * Every write here also goes through the lane — TypeORM shares the one SQLite
 * connection with whatever else is running (see InventoryLane).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly lane: InventoryLane,
  ) {}

  // --- The account's own notifications ----------------------------------------------

  /** GET /notifications — newest first. */
  async list(userId: string, query: NotificationListQuery): Promise<Paginated<NotificationDto>> {
    const where: FindOptionsWhere<Notification> = { userId };
    if (query.status) where.readAt = query.status === 'unread' ? IsNull() : Not(IsNull());
    const types = selectedTypes(query.category, query.type);
    // A category and types that do not overlap select nothing.
    if (types?.length === 0) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    if (types) where.type = In(types);

    const [rows, total] = await this.notifications.findAndCount({
      where,
      // id breaks ties: an announcement gives many rows the same instant.
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      items: rows.map(toDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** GET /notifications/unread-count — optionally only some categories. */
  async unreadCount(userId: string, categories: NotificationCategory[] = []): Promise<UnreadCount> {
    const where: FindOptionsWhere<Notification> = { userId, readAt: IsNull() };
    if (categories.length > 0) where.type = In(notificationTypesIn(...categories));
    return { unread: await this.notifications.countBy(where) };
  }

  /** GET /notifications/counts — totals and unread, overall and per category. */
  async counts(userId: string): Promise<NotificationCounts> {
    const rows = await this.notifications
      .createQueryBuilder('n')
      .select('n.type', 'type')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN n.readAt IS NULL THEN 1 ELSE 0 END)', 'unread')
      .where('n.userId = :userId', { userId })
      .groupBy('n.type')
      .getRawMany<{ type: string; total: number | string; unread: number | string }>();

    const zero = () => ({ total: 0, unread: 0 });
    const result: NotificationCounts = {
      ...zero(),
      categories: Object.fromEntries(
        NotificationCategory.options.map((category) => [category, zero()]),
      ) as NotificationCounts['categories'],
      types: Object.fromEntries(
        NotificationType.options.map((type) => [type, zero()]),
      ) as NotificationCounts['types'],
    };
    for (const row of rows) {
      const type = NotificationType.safeParse(row.type);
      if (!type.success) continue;
      const bucket = result.categories[NOTIFICATION_CATEGORY[type.data]];
      const total = Number(row.total);
      const unread = Number(row.unread);
      bucket.total += total;
      bucket.unread += unread;
      result.types[type.data] = { total, unread };
      result.total += total;
      result.unread += unread;
    }
    return result;
  }

  /** PATCH /notifications/:id — marks it read (keeping the first read time) or unread. */
  async setRead(
    userId: string,
    id: string,
    read: boolean,
    now: Date = new Date(),
  ): Promise<NotificationDto> {
    const changed = await this.lane.run((tx) =>
      read
        ? tx.run(
            `UPDATE "notifications" SET "readAt" = COALESCE("readAt", ?) WHERE "id" = ? AND "userId" = ?`,
            sqlTime(now),
            id,
            userId,
          )
        : tx.run(
            `UPDATE "notifications" SET "readAt" = NULL WHERE "id" = ? AND "userId" = ?`,
            id,
            userId,
          ),
    );
    // Someone else's notification answers exactly like a missing one.
    if (changed === 0) throw new NotFoundException('Notification not found');
    return toDto(await this.notifications.findOneByOrFail({ id, userId }));
  }

  /** POST /notifications/read-all — every unread one, or those of some categories. */
  async readAll(
    userId: string,
    categories: NotificationCategory[] = [],
    now: Date = new Date(),
  ): Promise<ReadAllResult> {
    const types = categories.length > 0 ? notificationTypesIn(...categories) : [];
    const updated = await this.lane.run((tx) =>
      tx.run(
        `UPDATE "notifications" SET "readAt" = ?
         WHERE "userId" = ? AND "readAt" IS NULL${types.length > 0 ? ` AND "type" IN (${types.map(() => '?').join(', ')})` : ''}`,
        sqlTime(now),
        userId,
        ...types,
      ),
    );
    return { updated };
  }

  /** DELETE /notifications/:id */
  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.lane.run((tx) =>
      tx.run(`DELETE FROM "notifications" WHERE "id" = ? AND "userId" = ?`, id, userId),
    );
    if (removed === 0) throw new NotFoundException('Notification not found');
  }

  // --- Admin ----------------------------------------------------------------------

  /** POST /notifications/announcements — one copy per account in the audience, audited. */
  async announce(
    actorId: string,
    input: CreateAnnouncementInput,
    now: Date = new Date(),
  ): Promise<AnnouncementResult> {
    const recipients = await this.lane.run((tx) => {
      const sent = notifyAudience(tx, now, input.audience, announcement(input.title, input.body));
      tx.run(
        `INSERT INTO "audit_logs" ("id", "actorId", "action", "entity", "entityId", "createdAt")
         VALUES (?, ?, ?, 'notifications', NULL, ?)`,
        randomUUID(),
        actorId,
        `notifications.announce:${input.audience}`,
        sqlTime(now),
      );
      return sent;
    });
    this.logger.log(`Announcement "${input.title}" sent to ${recipients} (${input.audience})`);
    return { recipients };
  }

  // --- Sending from outside a lane unit ---------------------------------------------

  /**
   * A new account: a welcome for them, a heads-up for the admins. Sent after the
   * account is saved and never fails the signup — a missing welcome is logged.
   */
  welcomeNewUser(
    user: { id: string; name: string; email: string },
    now: Date = new Date(),
  ): Promise<void> {
    return this.quietly('welcome a new user', (tx) => {
      notify(tx, now, { ...welcome(user.name), userId: user.id });
      notifyAdmins(tx, now, adminNewUser(user));
    });
  }

  /** One message for one account, after the change it describes; never throws. */
  sendTo(userId: string, message: NotificationMessage, now: Date = new Date()): Promise<void> {
    return this.quietly(`send ${message.type}`, (tx) => {
      notify(tx, now, { ...message, userId });
    });
  }

  /** One message for every admin; never throws (used where an error is already being handled). */
  sendToAdmins(message: NotificationMessage, now: Date = new Date()): Promise<void> {
    return this.quietly(`send ${message.type}`, (tx) => {
      notifyAdmins(tx, now, message);
    });
  }

  private async quietly(what: string, work: (tx: InventoryTx) => void): Promise<void> {
    try {
      await this.lane.run(work);
    } catch (error) {
      this.logger.warn(`Could not ${what}: ${(error as Error).message}`);
    }
  }
}

function toDto(row: Notification): NotificationDto {
  const type = row.type as NotificationType;
  return {
    id: row.id,
    type,
    category: NOTIFICATION_CATEGORY[type] ?? 'offers',
    title: row.title,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    bookingId: row.bookingId ?? null,
    showId: row.showId ?? null,
    couponCode: row.couponCode ?? null,
    subjectUserId: row.subjectUserId ?? null,
  };
}

/**
 * The types a list asks for: those of the categories, narrowed to the types
 * named (either may be empty, meaning "any"); undefined when nothing narrows it.
 */
function selectedTypes(
  categories: NotificationCategory[],
  types: NotificationType[],
): NotificationType[] | undefined {
  if (categories.length === 0 && types.length === 0) return undefined;
  const inCategories = categories.length > 0 ? notificationTypesIn(...categories) : undefined;
  if (types.length === 0) return inCategories;
  return inCategories ? types.filter((type) => inCategories.includes(type)) : types;
}
