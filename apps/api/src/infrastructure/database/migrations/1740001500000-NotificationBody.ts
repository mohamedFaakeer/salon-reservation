import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `notification.body` — nullable, set only on notifications whose text isn't
 * derivable from `type` + `appointmentId` (the win-back campaign message,
 * the first case of this). `NotificationService.buildMessage` normally
 * rebuilds a notification's text fresh from a stored `appointmentId` on
 * every retry (DATABASE.md §2.6: no subject/body columns originally); a
 * campaign message has no appointment to look up, so its exact text has to
 * be persisted on the row itself for a later manual retry to still send the
 * right thing rather than a generic fallback.
 */
export class NotificationBody1740001500000 implements MigrationInterface {
  name = "NotificationBody1740001500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "body" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN IF EXISTS "body"`);
  }
}
