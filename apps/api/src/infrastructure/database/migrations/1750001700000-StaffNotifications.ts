import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The notification bell: `staff_notification` is a customer-originated
 * booking event surfaced to staff (created alongside the matching
 * `audit_log` entry, never a second source of truth for "what happened");
 * `staff_notification_read` is per-user read state, a companion table for
 * the same reason `security_event_review` is separate from `audit_log`.
 * Neither carries a FK to `appointment` — same "must never block a purge"
 * reasoning `error_log` already documents for itself.
 */
export class StaffNotifications1750001700000 implements MigrationInterface {
  name = "StaffNotifications1750001700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff_notification" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "type" varchar(40) NOT NULL,
        "appointmentId" uuid,
        "title" varchar(160) NOT NULL,
        "body" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_notification" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_staff_notification_tenantId" ON "staff_notification" ("tenantId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_staff_notification_tenantId_createdAt" ON "staff_notification" ("tenantId", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "staff_notification_read" (
        "notificationId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "readAt" timestamptz NOT NULL,
        CONSTRAINT "PK_staff_notification_read" PRIMARY KEY ("notificationId", "userId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "staff_notification_read"`);
    await queryRunner.query(`DROP INDEX "IDX_staff_notification_tenantId_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_staff_notification_tenantId"`);
    await queryRunner.query(`DROP TABLE "staff_notification"`);
  }
}
