import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lets an Owner/Manager turn an individual predefined (system) template off
 * without deleting it — `notification_template` had no on/off switch at all
 * before this. Defaults every existing row to enabled so nothing already
 * relied upon changes behavior the moment this runs.
 */
export class NotificationTemplateEnabled1750000700000 implements MigrationInterface {
  name = "NotificationTemplateEnabled1750000700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_template" ADD COLUMN "isEnabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_template_isEnabled" ON "notification_template" ("isEnabled")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_template_isEnabled"`);
    await queryRunner.query(`ALTER TABLE "notification_template" DROP COLUMN IF EXISTS "isEnabled"`);
  }
}
