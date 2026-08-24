import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notification Quota table — tracks per-tenant monthly notification usage
 * for quota enforcement and billing limits.
 */
export class NotificationQuota1750000500000 implements MigrationInterface {
  name = "NotificationQuota1750000500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_quota" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "month"             varchar(7) NOT NULL, -- YYYY-MM format
        "emailSent"         int NOT NULL DEFAULT 0,
        "smsSent"           int NOT NULL DEFAULT 0,
        "whatsappSent"      int NOT NULL DEFAULT 0,
        "consoleSent"       int NOT NULL DEFAULT 0,
        "emailLimit"        int NOT NULL DEFAULT 1000,
        "smsLimit"          int NOT NULL DEFAULT 500,
        "whatsappLimit"     int NOT NULL DEFAULT 500,
        "consoleLimit"      int NOT NULL DEFAULT 5000,
        "alertedAt"         timestamptz,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_quota_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_notification_quota_tenant_month" UNIQUE ("tenantId", "month")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_quota_tenantId" ON "notification_quota" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_quota_month" ON "notification_quota" ("month")`);

    // Initialize quota for active tenants for current month
    await queryRunner.query(`
      INSERT INTO "notification_quota" ("tenantId", "month", "emailSent", "smsSent", "whatsappSent", "consoleSent",
        "emailLimit", "smsLimit", "whatsappLimit", "consoleLimit")
      SELECT t."id",
        to_char(now(), 'YYYY-MM'),
        0, 0, 0, 0,
        1000, 500, 500, 5000
      FROM "tenant" t
      WHERE t."status" = 'ACTIVE'
      ON CONFLICT ("tenantId", "month") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_quota"`);
  }
}