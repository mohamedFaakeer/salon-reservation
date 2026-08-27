import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * DECISIONS.md §40 — a per-tenant, per-event on/off switch ("don't send
 * Cancellation Confirmation messages at all"), independent of channel or
 * any Rule/Template. No row means enabled, so no backfill is needed here —
 * new tenants and new `NotificationEvent` values both default to "on"
 * without ever needing a migration to say so.
 */
export class NotificationEventSetting1750000800000 implements MigrationInterface {
  name = "NotificationEventSetting1750000800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_event_setting" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL,
        "eventType"   varchar(50) NOT NULL,
        "isEnabled"   boolean NOT NULL DEFAULT true,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_event_setting_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_notification_event_setting_tenant_event" UNIQUE ("tenantId", "eventType")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_event_setting_tenantId" ON "notification_event_setting" ("tenantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_event_setting"`);
  }
}
