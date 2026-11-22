import type { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMNS_BEFORE = `"id", "userId", "type", "title", "body", "readAt", "createdAt"`;
const USER_FK = `CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE`;

/**
 * In-app notifications API.
 *
 * - bookingId / showId: what a notification is about, so it can link there. Both
 *   are SET NULL on delete — an unpaid hold is deleted when it lapses, and the
 *   message about it must survive.
 * - couponCode: the offer code a message announces.
 * - dedupeKey: timed and throttled messages (reminders, alerts) are written once
 *   per account and key; UNIQUE("userId", "dedupeKey") enforces it (NULL keys
 *   never clash in SQLite).
 * - ("userId", "createdAt") index for the newest-first list.
 *
 * SQLite cannot add a foreign key to an existing table, so the table is rebuilt
 * once. Hand-written: the generated version rebuilt it twice.
 */
export class Notifications1794471327621 implements MigrationInterface {
  name = 'Notifications1794471327621';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "notifications_userId_readAt_idx"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_notifications" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "type" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "readAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "bookingId" varchar, "showId" varchar, "couponCode" text, "dedupeKey" text, ${USER_FK}, CONSTRAINT "notifications_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "notifications_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows" ("id") ON DELETE SET NULL ON UPDATE CASCADE)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_notifications" (${COLUMNS_BEFORE}) SELECT ${COLUMNS_BEFORE} FROM "notifications"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`ALTER TABLE "temporary_notifications" RENAME TO "notifications"`);
    await queryRunner.query(
      `CREATE INDEX "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications" ("userId", "dedupeKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "notifications_userId_dedupeKey_key"`);
    await queryRunner.query(`DROP INDEX "notifications_userId_createdAt_idx"`);
    await queryRunner.query(`DROP INDEX "notifications_userId_readAt_idx"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_notifications" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "type" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "readAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), ${USER_FK})`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_notifications" (${COLUMNS_BEFORE}) SELECT ${COLUMNS_BEFORE} FROM "notifications"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`ALTER TABLE "temporary_notifications" RENAME TO "notifications"`);
    await queryRunner.query(
      `CREATE INDEX "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt")`,
    );
  }
}
