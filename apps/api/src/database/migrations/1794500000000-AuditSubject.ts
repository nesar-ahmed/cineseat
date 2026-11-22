import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * audit_logs.subject: what a change was about, in words, as it read at the
 * time ("Screen 2", a movie's title), so history stays readable after the
 * thing is deleted. And an index for reading one thing's history (the admin
 * detail pages filter on entity + entityId).
 *
 * Hand-written: a nullable column can be added in place; the generated version
 * rebuilt the table.
 */
export class AuditSubject1794500000000 implements MigrationInterface {
  name = 'AuditSubject1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "subject" text`);
    await queryRunner.query(
      `CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs" ("entity", "entityId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "audit_logs_entity_entityId_idx"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "subject"`);
  }
}
