import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seat holds: a PENDING booking reserves its seats until `expiresAt`. The index
 * lets the expiry job find lapsed holds without scanning every booking.
 *
 * Written by hand: the generated version rebuilt `bookings` (copy, DROP TABLE,
 * rename) — safe only because TypeORM turns foreign keys off while migrating;
 * otherwise the DROP would cascade into `booking_seats`. Adding a column needs
 * no rebuild and no such assumption.
 */
export class SeatHolds1794328768063 implements MigrationInterface {
  name = 'SeatHolds1794328768063';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN "expiresAt" datetime`);
    await queryRunner.query(
      `CREATE INDEX "bookings_status_expiresAt_idx" ON "bookings" ("status", "expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "bookings_status_expiresAt_idx"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "expiresAt"`);
  }
}
