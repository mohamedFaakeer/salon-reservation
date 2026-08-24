import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customer Notification Preferences table — per-customer channel opt-in/opt-out
 * and timing preferences. Used by the evaluator to filter eligible channels.
 */
export class CustomerNotificationPreferences1750000400000 implements MigrationInterface {
  name = "CustomerNotificationPreferences1750000400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customer_notification_preferences" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"        uuid NOT NULL,
        "customerId"      uuid NOT NULL,
        "emailOptIn"      boolean NOT NULL DEFAULT true,
        "smsOptIn"        boolean NOT NULL DEFAULT true,
        "whatsappOptIn"   boolean NOT NULL DEFAULT true,
        "consoleOptIn"    boolean NOT NULL DEFAULT true,
        "marketingOptIn"  boolean NOT NULL DEFAULT false,
        "quietHoursStart" time,
        "quietHoursEnd"   time,
        "timezone"        varchar(50) NOT NULL DEFAULT 'UTC',
        "createdAt"       timestamptz NOT NULL DEFAULT now(),
        "updatedAt"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_customer_notification_preferences_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_notification_preferences_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_customer_notification_preferences_customer" UNIQUE ("customerId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customer_notification_preferences_tenantId" ON "customer_notification_preferences" ("tenantId")`);

    // Create preferences for existing customers with defaults
    await queryRunner.query(`
      INSERT INTO "customer_notification_preferences" ("tenantId", "customerId", "emailOptIn", "smsOptIn", "whatsappOptIn", "consoleOptIn", "marketingOptIn", "timezone")
      SELECT c."tenantId", c."id", true, true, true, true, false, 'UTC'
      FROM "customer" c
      LEFT JOIN "customer_notification_preferences" p ON p."customerId" = c."id"
      WHERE p."id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_notification_preferences"`);
  }
}