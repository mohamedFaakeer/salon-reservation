import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notification Rule table — stores configurable notification rules per tenant.
 * Each rule defines when to send, which channels, targeting criteria, and template.
 */
export class NotificationRule1750000100000 implements MigrationInterface {
  name = "NotificationRule1750000100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_rule" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "name"              varchar(160) NOT NULL,
        "timingType"        varchar(30) NOT NULL CHECK ("timingType" IN ('BEFORE_APPT', 'DAY_OF_APPT', 'AFTER_BOOKING', 'AFTER_COMPLETION')),
        "timingValue"       jsonb NOT NULL,
        "channels"          text[] NOT NULL CHECK ("channels" @> ARRAY[]::text[]),
        "templateSubject"   text,
        "templateBody"      text NOT NULL,
        "targeting"         jsonb NOT NULL DEFAULT '{}',
        "isEnabled"         boolean NOT NULL DEFAULT true,
        "priority"          int NOT NULL DEFAULT 0,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_rule_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_rule_tenantId" ON "notification_rule" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_rule_isEnabled" ON "notification_rule" ("isEnabled")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_rule_priority" ON "notification_rule" ("priority")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_rule"`);
  }
}