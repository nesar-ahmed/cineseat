import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The starting CineSeat schema: same tables, columns, defaults, index names and
 * foreign-key rules as the original data model (guideline section 7). Tables are
 * created parents-first, so every foreign key points at a table that already exists.
 */
export class InitialSchema1794298851817 implements MigrationInterface {
  name = 'InitialSchema1794298851817';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" text NOT NULL,
        "passwordHash" text NOT NULL,
        "name" text NOT NULL,
        "phone" text,
        "avatarPath" text,
        "role" text NOT NULL DEFAULT ('USER'),
        "preferredCity" text,
        "preferredGenres" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "users_email_key" ON "users" ("email")`);
    await queryRunner.query(`
      CREATE TABLE "movies" (
        "id" varchar PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "genre" text NOT NULL,
        "language" text NOT NULL,
        "durationMin" integer NOT NULL,
        "releaseDate" datetime NOT NULL,
        "posterPath" text,
        "trailerUrl" text,
        "status" text NOT NULL DEFAULT ('NOW_SHOWING'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "movies_status_idx" ON "movies" ("status")`);
    await queryRunner.query(`
      CREATE TABLE "theaters" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "city" text NOT NULL,
        "address" text NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "theaters_city_idx" ON "theaters" ("city")`);
    await queryRunner.query(`
      CREATE TABLE "screens" (
        "id" varchar PRIMARY KEY NOT NULL,
        "theaterId" varchar NOT NULL,
        "name" text NOT NULL,
        "rows" integer NOT NULL,
        "cols" integer NOT NULL,
        CONSTRAINT "screens_theaterId_fkey" FOREIGN KEY ("theaterId") REFERENCES "theaters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "seats" (
        "id" varchar PRIMARY KEY NOT NULL,
        "screenId" varchar NOT NULL,
        "row" integer NOT NULL,
        "number" integer NOT NULL,
        "category" text NOT NULL DEFAULT ('STANDARD'),
        CONSTRAINT "seats_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "seats_screenId_row_number_key" ON "seats" ("screenId", "row", "number")`,
    );
    await queryRunner.query(`
      CREATE TABLE "shows" (
        "id" varchar PRIMARY KEY NOT NULL,
        "movieId" varchar NOT NULL,
        "screenId" varchar NOT NULL,
        "startsAt" datetime NOT NULL,
        "language" text NOT NULL,
        "format" text NOT NULL DEFAULT ('2D'),
        "basePrice" integer NOT NULL,
        CONSTRAINT "shows_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "movies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "shows_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "shows_movieId_startsAt_idx" ON "shows" ("movieId", "startsAt")`,
    );
    await queryRunner.query(`
      CREATE TABLE "show_seats" (
        "id" varchar PRIMARY KEY NOT NULL,
        "showId" varchar NOT NULL,
        "seatId" varchar NOT NULL,
        "status" text NOT NULL DEFAULT ('AVAILABLE'),
        "heldBy" text,
        "holdExpiresAt" datetime,
        CONSTRAINT "show_seats_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "show_seats_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "seats" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "show_seats_showId_status_idx" ON "show_seats" ("showId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "show_seats_status_holdExpiresAt_idx" ON "show_seats" ("status", "holdExpiresAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "show_seats_showId_seatId_key" ON "show_seats" ("showId", "seatId")`,
    );
    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id" varchar PRIMARY KEY NOT NULL,
        "code" text NOT NULL,
        "type" text NOT NULL,
        "value" integer NOT NULL,
        "validFrom" datetime NOT NULL,
        "validTo" datetime NOT NULL,
        "usageLimit" integer,
        "usedCount" integer NOT NULL DEFAULT (0)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "coupons_code_key" ON "coupons" ("code")`);
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "showId" varchar NOT NULL,
        "status" text NOT NULL DEFAULT ('PENDING'),
        "totalAmount" integer NOT NULL,
        "couponId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "bookings_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "bookings_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "bookings_showId_idx" ON "bookings" ("showId")`);
    await queryRunner.query(
      `CREATE INDEX "bookings_userId_status_idx" ON "bookings" ("userId", "status")`,
    );
    await queryRunner.query(`
      CREATE TABLE "booking_seats" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bookingId" varchar NOT NULL,
        "showSeatId" varchar NOT NULL,
        "price" integer NOT NULL,
        CONSTRAINT "REL_0bc122ca2e4844e3f61ea88ef7" UNIQUE ("showSeatId"),
        CONSTRAINT "booking_seats_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "booking_seats_showSeatId_fkey" FOREIGN KEY ("showSeatId") REFERENCES "show_seats" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bookingId" varchar NOT NULL,
        "provider" text NOT NULL DEFAULT ('mock'),
        "providerRef" text NOT NULL,
        "status" text NOT NULL,
        "amount" integer NOT NULL,
        "userId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "payments_providerRef_key" ON "payments" ("providerRef")`,
    );
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "movieId" varchar NOT NULL,
        "rating" integer NOT NULL,
        "comment" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "reviews_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "movies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "reviews_userId_movieId_key" ON "reviews" ("userId", "movieId")`,
    );
    await queryRunner.query(`
      CREATE TABLE "wishlists" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "movieId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "wishlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "wishlists_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "movies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "wishlists_userId_movieId_key" ON "wishlists" ("userId", "movieId")`,
    );
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" varchar NOT NULL,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "readAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt")`,
    );
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" varchar PRIMARY KEY NOT NULL,
        "actorId" varchar NOT NULL,
        "action" text NOT NULL,
        "entity" text NOT NULL,
        "entityId" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs" ("actorId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Children first; dropping a table also drops its indexes.
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "wishlists"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "booking_seats"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TABLE "show_seats"`);
    await queryRunner.query(`DROP TABLE "shows"`);
    await queryRunner.query(`DROP TABLE "seats"`);
    await queryRunner.query(`DROP TABLE "screens"`);
    await queryRunner.query(`DROP TABLE "theaters"`);
    await queryRunner.query(`DROP TABLE "movies"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
