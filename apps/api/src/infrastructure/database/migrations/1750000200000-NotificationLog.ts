import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notification Log table — delivery records for each notification sent.
 * One row per rule/appointment/customer/channel combination.
 */
export class NotificationLog1750000200000 implements MigrationInterface {
  name = "NotificationLog1750000200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_log" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "ruleId"            uuid,
        "appointmentId"     uuid,
        "customerId"        uuid,
        "channel"           varchar(10) NOT NULL CHECK ("channel" IN ('console', 'email', 'sms', 'whatsapp')),
        "status"            varchar(10) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'BOUNCED')),
        "providerMessageId" varchar(255),
        "errorMessage"      text,
        "scheduledFor"      timestamptz NOT NULL,
        "sentAt"            timestamptz,
        "retryCount"        int NOT NULL DEFAULT 0,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_log_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notification_log_rule" FOREIGN KEY ("ruleId")
          REFERENCES "notification_rule"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_notification_log_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_notification_log_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_tenantId" ON "notification_log" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_status" ON "notification_log" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_scheduledFor" ON "notification_log" ("scheduledFor")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_appointmentId" ON "notification_log" ("appointmentId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_log_ruleId" ON "notification_log" ("ruleId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_log"`);
  }
}