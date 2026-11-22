import type { MigrationInterface, QueryRunner } from 'typeorm';

const BEFORE = `"id", "userId", "type", "title", "body", "readAt", "createdAt", "bookingId", "showId", "couponCode", "dedupeKey"`;
const COLUMNS = `"id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "type" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "readAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "bookingId" varchar, "showId" varchar, "couponCode" text, "dedupeKey" text`;
const FKS = `CONSTRAINT "notifications_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "notifications_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE`;

/**
 * notifications.subjectUserId: the account a notification is about — a new
 * sign-up, for the admins — so the admin panel can link to that user. SET NULL
 * on delete: the message outlives the account. Existing sign-up notices are
 * backfilled from their dedupe key (`new-user:<id>`).
 *
 * SQLite cannot add a foreign key to an existing table, so the table is rebuilt
 * once. Hand-written: the generated version rebuilt it twice.
 */
export class NotificationSubject1794479940156 implements MigrationInterface {
  name = 'NotificationSubject1794479940156';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexes(queryRunner);
    await queryRunner.query(
      `CREATE TABLE "temporary_notifications" (${COLUMNS}, "subjectUserId" varchar, ${FKS}, CONSTRAINT "notifications_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_notifications" (${BEFORE}, "subjectUserId")
       SELECT ${BEFORE.split(', ')
         .map((column) => `n.${column}`)
         .join(', ')}, u."id"
       FROM "notifications" n
       LEFT JOIN "users" u
         ON n."type" = 'ADMIN_NEW_USER' AND u."id" = substr(n."dedupeKey", length('new-user:') + 1)`,
    );
    await this.swap(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexes(queryRunner);
    await queryRunner.query(`CREATE TABLE "temporary_notifications" (${COLUMNS}, ${FKS})`);
    await queryRunner.query(
      `INSERT INTO "temporary_notifications" (${BEFORE}) SELECT ${BEFORE} FROM "notifications"`,
    );
    await this.swap(queryRunner);
  }

  private async dropIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "notifications_userId_dedupeKey_key"`);
    await queryRunner.query(`DROP INDEX "notifications_userId_createdAt_idx"`);
    await queryRunner.query(`DROP INDEX "notifications_userId_readAt_idx"`);
  }

  /** The rebuilt table takes the old one's place, with its indexes. */
  private async swap(queryRunner: QueryRunner): Promise<void> {
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
}
