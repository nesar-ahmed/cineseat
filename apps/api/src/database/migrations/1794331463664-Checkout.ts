import type { MigrationInterface, QueryRunner } from 'typeorm';

const BOOKING_SEATS_FKS = `CONSTRAINT "booking_seats_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "booking_seats_showSeatId_fkey" FOREIGN KEY ("showSeatId") REFERENCES "show_seats" ("id") ON DELETE RESTRICT ON UPDATE CASCADE`;

/**
 * Checkout and (mock) payments.
 *
 * - booking_seats: a seat may now appear in many bookings over time — one that
 *   failed keeps its seats as history — but in only one live booking: the
 *   table-wide UNIQUE("showSeatId") becomes a partial unique index on rows that
 *   are not released. SQLite cannot drop a constraint, so this one table is
 *   rebuilt (nothing references it).
 * - payments: how the buyer paid, why a payment failed, and when it settled.
 * - coupons: the rules the offers already advertise (weekend shows, three seats
 *   or more, first booking) become data the API enforces.
 *
 * Hand-written: the generated version rebuilt coupons and payments as well and
 * left the old UNIQUE constraint in place.
 */
export class Checkout1794331463664 implements MigrationInterface {
  name = 'Checkout1794331463664';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_booking_seats" ("id" varchar PRIMARY KEY NOT NULL, "bookingId" varchar NOT NULL, "showSeatId" varchar NOT NULL, "price" integer NOT NULL, "releasedAt" datetime, ${BOOKING_SEATS_FKS})`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_booking_seats" ("id", "bookingId", "showSeatId", "price") SELECT "id", "bookingId", "showSeatId", "price" FROM "booking_seats"`,
    );
    await queryRunner.query(`DROP TABLE "booking_seats"`);
    await queryRunner.query(`ALTER TABLE "temporary_booking_seats" RENAME TO "booking_seats"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "booking_seats_showSeatId_live_key" ON "booking_seats" ("showSeatId") WHERE "releasedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "booking_seats_bookingId_idx" ON "booking_seats" ("bookingId")`,
    );

    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "method" text`);
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "failureReason" text`);
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "completedAt" datetime`);
    await queryRunner.query(`CREATE INDEX "payments_bookingId_idx" ON "payments" ("bookingId")`);

    await queryRunner.query(`ALTER TABLE "coupons" ADD COLUMN "description" text`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD COLUMN "minSeats" integer`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD COLUMN "weekdays" text`);
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD COLUMN "firstBookingOnly" boolean NOT NULL DEFAULT (0)`,
    );
    // The launch offers, as advertised on the home page (no-ops where they do not exist).
    await queryRunner.query(
      `UPDATE "coupons" SET "description" = '10% off weekend shows (Friday to Sunday)', "weekdays" = '0,5,6' WHERE "code" = 'WEEKEND10'`,
    );
    await queryRunner.query(
      `UPDATE "coupons" SET "description" = '৳100 off bookings of three seats or more', "minSeats" = 3 WHERE "code" = 'FLAT100'`,
    );
    await queryRunner.query(
      `UPDATE "coupons" SET "description" = '৳50 off your first booking', "firstBookingOnly" = 1 WHERE "code" = 'FIRST50'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "firstBookingOnly"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "weekdays"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "minSeats"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "description"`);

    await queryRunner.query(`DROP INDEX "payments_bookingId_idx"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "completedAt"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "failureReason"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "method"`);

    // Released rows (seats of failed bookings) cannot live under the old one-row-per-seat rule.
    await queryRunner.query(`DELETE FROM "booking_seats" WHERE "releasedAt" IS NOT NULL`);
    await queryRunner.query(`DROP INDEX "booking_seats_bookingId_idx"`);
    await queryRunner.query(`DROP INDEX "booking_seats_showSeatId_live_key"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_booking_seats" ("id" varchar PRIMARY KEY NOT NULL, "bookingId" varchar NOT NULL, "showSeatId" varchar NOT NULL, "price" integer NOT NULL, CONSTRAINT "REL_0bc122ca2e4844e3f61ea88ef7" UNIQUE ("showSeatId"), ${BOOKING_SEATS_FKS})`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_booking_seats" ("id", "bookingId", "showSeatId", "price") SELECT "id", "bookingId", "showSeatId", "price" FROM "booking_seats"`,
    );
    await queryRunner.query(`DROP TABLE "booking_seats"`);
    await queryRunner.query(`ALTER TABLE "temporary_booking_seats" RENAME TO "booking_seats"`);
  }
}
