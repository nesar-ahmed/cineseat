import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  defaultUserSortOrder,
  type AdminUser,
  type AdminUserDetail,
  type AdminUserList,
  type AdminUserListQuery,
  type AdminUserSort,
  type PublicUser,
  type UserRole,
} from '@cineseat/shared';
import { historyOf, recordChangeInLane } from '../common/audit/audit-log';
import { dayRangeInZone, startOfDayInZone } from '../common/time/zoned-time';
import { InventoryLane, fromSqlTime, sqlTime, type SqlValue } from '../database/inventory-lane';
import { containsPattern } from '../movies/movie-filters';
import { roleChanged } from '../notifications/messages';
import { notify } from '../notifications/notify';
import { UsersService } from './users.service';

/**
 * Per account: paid bookings and when the last one was made; money paid and
 * refunded. Aggregated on read (a few thousand accounts are nothing for SQLite).
 */
const STATS_CTE = `
  WITH "bk" AS (
    SELECT b."userId" AS "userId", COUNT(*) AS "paid", MAX(b."createdAt") AS "last"
    FROM "bookings" b WHERE b."status" = 'CONFIRMED' GROUP BY b."userId"
  ),
  "pay" AS (
    SELECT p."userId" AS "userId",
           SUM(CASE WHEN p."status" = 'SUCCESS' THEN p."amount" ELSE 0 END) AS "spent",
           SUM(CASE WHEN p."status" = 'REFUNDED' THEN p."amount" ELSE 0 END) AS "refunded"
    FROM "payments" p GROUP BY p."userId"
  )`;

const FROM = `
  FROM "users" u
  LEFT JOIN "bk" ON "bk"."userId" = u."id"
  LEFT JOIN "pay" ON "pay"."userId" = u."id"`;

const COLUMNS = `
  u."id", u."email", u."name", u."phone", u."avatarPath", u."role", u."preferredCity",
  u."preferredGenres", u."createdAt", u."updatedAt",
  COALESCE("bk"."paid", 0) AS "paid", "bk"."last" AS "last",
  COALESCE("pay"."spent", 0) AS "spent", COALESCE("pay"."refunded", 0) AS "refunded"`;

const ORDER_BY: Record<AdminUserSort, (direction: string) => string> = {
  joined: (d) => `u."createdAt" ${d}`,
  name: (d) => `u."name" COLLATE NOCASE ${d}`,
  bookings: (d) => `COALESCE("bk"."paid", 0) ${d}`,
  spent: (d) => `COALESCE("pay"."spent", 0) ${d}`,
  lastBooking: (d) => `"bk"."last" ${d} NULLS LAST`,
};

type Row = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarPath: string | null;
  role: UserRole;
  preferredCity: string | null;
  preferredGenres: string | null;
  createdAt: string;
  updatedAt: string;
  paid: number;
  last: string | null;
  spent: number;
  refunded: number;
};

type Where = { sql: string; params: SqlValue[] };

const SELF = 'You can’t change your own role — another admin has to.';
const LAST_ADMIN = 'This is the only admin: make someone else an admin first.';

/**
 * Accounts for the admin panel: the read model (GET /admin/users and
 * /admin/users/:id — every account with what it has booked and spent, and one
 * account's profile, figures, favourites, role limits and history) and role
 * changes (PATCH /users/:id/role), under the limits the read model reports.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly lane: InventoryLane,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async list(query: AdminUserListQuery): Promise<AdminUserList> {
    const filters = this.where(query);
    const withRole = query.role
      ? { sql: `${filters.sql} AND u."role" = ?`, params: [...filters.params, query.role] }
      : filters;
    const direction = (query.order ?? defaultUserSortOrder(query.sort)).toUpperCase();

    const [rows, roleCounts] = await Promise.all([
      this.dataSource.query<Row[]>(
        `${STATS_CTE} SELECT ${COLUMNS} ${FROM} WHERE ${withRole.sql}
         ORDER BY ${ORDER_BY[query.sort](direction)}, u."name" COLLATE NOCASE ASC, u."id" ASC
         LIMIT ? OFFSET ?`,
        [...withRole.params, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      // Tabs: accounts per role with every other filter applied.
      this.dataSource.query<{ role: UserRole; n: number }[]>(
        `${STATS_CTE} SELECT u."role" AS "role", COUNT(*) AS "n" ${FROM} WHERE ${filters.sql} GROUP BY u."role"`,
        filters.params,
      ),
    ]);

    const counts = { all: 0, USER: 0, ADMIN: 0 };
    for (const row of roleCounts) {
      counts[row.role] = row.n;
      counts.all += row.n;
    }
    return {
      items: rows.map((row) => this.toDto(row)),
      total: query.role ? counts[query.role] : counts.all,
      page: query.page,
      pageSize: query.pageSize,
      counts,
    };
  }

  /** `actorId`: the admin looking, for whether they may change this account's role. */
  async detail(
    id: string,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<AdminUserDetail> {
    const rows = await this.dataSource.query<Row[]>(
      `${STATS_CTE} SELECT ${COLUMNS} ${FROM} WHERE u."id" = ?`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('User not found');

    const [[more], movies, theaters, history, admins] = await Promise.all([
      this.dataSource.query<
        {
          tickets: number | null;
          upcoming: number | null;
          notCompleted: number | null;
          first: string | null;
        }[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM "booking_seats" bs JOIN "bookings" b ON b."id" = bs."bookingId"
            WHERE b."userId" = ? AND b."status" = 'CONFIRMED' AND bs."releasedAt" IS NULL) AS "tickets",
           (SELECT COUNT(*) FROM "bookings" b JOIN "shows" s ON s."id" = b."showId"
            WHERE b."userId" = ? AND b."status" = 'CONFIRMED' AND s."startsAt" > ?) AS "upcoming",
           (SELECT COUNT(*) FROM "bookings" b WHERE b."userId" = ? AND b."status" = 'FAILED') AS "notCompleted",
           (SELECT MIN(b."createdAt") FROM "bookings" b WHERE b."userId" = ? AND b."status" = 'CONFIRMED') AS "first"`,
        [id, id, sqlTime(now), id, id],
      ),
      this.dataSource.query<{ id: string; title: string; bookings: number }[]>(
        `SELECT m."id", m."title", COUNT(*) AS "bookings"
         FROM "bookings" b JOIN "shows" s ON s."id" = b."showId" JOIN "movies" m ON m."id" = s."movieId"
         WHERE b."userId" = ? AND b."status" = 'CONFIRMED'
         GROUP BY m."id" ORDER BY "bookings" DESC, m."title" ASC LIMIT 3`,
        [id],
      ),
      this.dataSource.query<{ id: string; name: string; bookings: number }[]>(
        `SELECT t."id", t."name", COUNT(*) AS "bookings"
         FROM "bookings" b JOIN "shows" s ON s."id" = b."showId"
         JOIN "screens" sc ON sc."id" = s."screenId" JOIN "theaters" t ON t."id" = sc."theaterId"
         WHERE b."userId" = ? AND b."status" = 'CONFIRMED'
         GROUP BY t."id" ORDER BY "bookings" DESC, t."name" ASC LIMIT 3`,
        [id],
      ),
      historyOf(this.dataSource.manager, 'users', id),
      this.dataSource.query<{ n: number }[]>(
        `SELECT COUNT(*) AS "n" FROM "users" WHERE "role" = 'ADMIN'`,
      ),
    ]);
    const roleLock = whyRoleLocked(row, actorId, admins[0]?.n ?? 0);

    const base = this.toDto(row);
    return {
      ...base,
      stats: {
        ...base.stats,
        tickets: more?.tickets ?? 0,
        upcoming: more?.upcoming ?? 0,
        notCompleted: more?.notCompleted ?? 0,
        firstBookingAt: more?.first ? fromSqlTime(more.first).toISOString() : null,
      },
      favourites: { movies, theaters },
      constraints: { canChangeRole: roleLock === null, roleLockedReason: roleLock },
      history,
      updatedAt: fromSqlTime(row.updatedAt).toISOString(),
    };
  }

  /**
   * PATCH /users/:id/role: give an account admin access, or take it away. Never
   * your own account (another admin has to), never the last admin; the same role
   * changes nothing. One lane unit: the checks, the change, its audit record and
   * the account's notification commit together, so two admins demoting each
   * other at once still leave one. The role is read from the database on every
   * request, so it applies to the account's open sessions at once.
   */
  async changeRole(
    id: string,
    role: UserRole,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<PublicUser> {
    await this.lane.run((tx) => {
      const user = tx.get<{ id: string; name: string; email: string; role: UserRole }>(
        `SELECT "id", "name", "email", "role" FROM "users" WHERE "id" = ?`,
        id,
      );
      if (!user) throw new NotFoundException('User not found');
      if (user.role === role) return;
      const admins = tx.get<{ n: number }>(
        `SELECT COUNT(*) AS "n" FROM "users" WHERE "role" = 'ADMIN'`,
      );
      const blocked = whyRoleLocked(user, actorId, admins?.n ?? 0);
      if (blocked) throw new ConflictException(blocked);

      tx.run(
        `UPDATE "users" SET "role" = ?, "updatedAt" = ? WHERE "id" = ?`,
        role,
        sqlTime(now),
        id,
      );
      recordChangeInLane(tx, {
        actorId,
        entity: 'users',
        entityId: id,
        verb: `role.${role.toLowerCase()}`,
        subject: `${user.name} <${user.email}>`,
        now,
      });
      notify(tx, now, { ...roleChanged(role), userId: id });
    });
    return this.users.getProfile(id);
  }

  // --- Internals ------------------------------------------------------------------

  /** Everything in `query` but the role, paging and sort. */
  private where(query: AdminUserListQuery): Where {
    const clauses: string[] = ['1 = 1'];
    const params: SqlValue[] = [];
    const search = query.search?.trim();
    if (search) {
      const like = containsPattern(search);
      clauses.push(`(u."name" LIKE ? ESCAPE '\\' OR u."email" LIKE ? ESCAPE '\\'
        OR u."phone" LIKE ? ESCAPE '\\' OR u."id" = ?)`);
      params.push(like, like, like, search);
    }
    if (query.activity) {
      clauses.push(`COALESCE("bk"."paid", 0) ${query.activity === 'booked' ? '>' : '='} 0`);
    }
    if (query.joinedFrom) {
      clauses.push('u."createdAt" >= ?');
      params.push(sqlTime(startOfDayInZone(query.joinedFrom, this.timeZone)));
    }
    if (query.joinedTo) {
      clauses.push('u."createdAt" < ?');
      params.push(sqlTime(dayRangeInZone(query.joinedTo, this.timeZone).end));
    }
    return { sql: clauses.join(' AND '), params };
  }

  private toDto(row: Row): AdminUser {
    return {
      ...this.users.toPublicUser({ ...row, createdAt: fromSqlTime(row.createdAt) }),
      stats: {
        paidBookings: row.paid,
        spent: row.spent,
        refunded: row.refunded,
        lastBookingAt: row.last ? fromSqlTime(row.last).toISOString() : null,
      },
    };
  }
}

/**
 * Why `actorId` may not change this account's role, or null: not your own, and
 * never the last admin. The admin panel shows the same words.
 */
function whyRoleLocked(
  user: { id: string; role: UserRole },
  actorId: string | null,
  admins: number,
): string | null {
  if (actorId !== null && user.id === actorId) return SELF;
  if (user.role === 'ADMIN' && admins <= 1) return LAST_ADMIN;
  return null;
}
