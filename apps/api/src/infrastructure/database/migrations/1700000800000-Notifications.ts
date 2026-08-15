import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P15 — Notifications. One table (DATABASE.md §2.6): a delivery record per
 * appointment/channel, with retry bookkeeping inline (no separate attempt
 * log, unlike `payment`/`payment_attempt` — the doc's own simpler shape).
 */
export class Notifications1700000800000 implements MigrationInterface {
  name = "Notifications1700000800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "appointmentId"     uuid,
        "customerId"        uuid,
        "type"              varchar(30) NOT NULL,
        "channel"           varchar(10) NOT NULL,
        "recipient"         varchar(255) NOT NULL,
        "status"            varchar(10) NOT NULL DEFAULT 'PENDING',
        "retryCount"        int NOT NULL DEFAULT 0,
        "nextRetryAt"       timestamptz,
        "lastError"         varchar(500),
        "providerMessageId" varchar(255),
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notification_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_notification_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_tenantId" ON "notification" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_appointmentId" ON "notification" ("appointmentId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_status_nextRetryAt" ON "notification" ("status", "nextRetryAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"`);
  }
}
