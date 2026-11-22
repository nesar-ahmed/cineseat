import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Venue details the booking UI shows: a theater's amenities, and which formats
 * each screen can project (a 3D show needs a 3D screen). Existing screens are
 * 2D until an admin says otherwise.
 */
export class VenueDetails1794307231368 implements MigrationInterface {
  name = 'VenueDetails1794307231368';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "theaters" ADD COLUMN "amenities" text NOT NULL DEFAULT ('[]')`,
    );
    await queryRunner.query(
      `ALTER TABLE "screens" ADD COLUMN "formats" text NOT NULL DEFAULT ('2D')`,
    );
    // Screens that already run 3D shows evidently support 3D.
    await queryRunner.query(
      `UPDATE "screens" SET "formats" = '2D,3D' WHERE "id" IN (SELECT DISTINCT "screenId" FROM "shows" WHERE "format" = '3D')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "screens" DROP COLUMN "formats"`);
    await queryRunner.query(`ALTER TABLE "theaters" DROP COLUMN "amenities"`);
  }
}
