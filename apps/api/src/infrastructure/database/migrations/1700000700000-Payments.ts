import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P13 — Payments & advances.
 *
 *  1. `payment` — one row per recorded advance/full/balance payment.
 *     `idempotencyKey` is UNIQUE NOT NULL (CLAUDE.md §1.6: "duplicate
 *     callbacks/retries create no duplicates"). `appointmentId` is nullable
 *     + SET NULL: a payment's audit trail must outlive the appointment it
 *     was recorded against (CLAUDE.md: no hard deletes on business records).
 *  2. `payment_attempt` — provider callback/event log; `(provider,
 *     providerEventId)` unique absorbs duplicate webhook deliveries. Not
 *     exercised by the synchronous ManualProvider this phase, but the
 *     constraint exists for the (never-invoked) PayHereProvider stub.
 *  3. `refund` — manual, record-only refund rows (P13); the cancellation-
 *     policy-driven calculation of *how much* to refund is P14's job.
 */
export class Payments1700000700000 implements MigrationInterface {
  name = "Payments1700000700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"           uuid NOT NULL,
        "appointmentId"      uuid,
        "customerId"         uuid NOT NULL,
        "amountCents"        int NOT NULL,
        "method"             varchar(20) NOT NULL,
        "state"              varchar(24) NOT NULL DEFAULT 'PENDING',
        "type"               varchar(10) NOT NULL,
        "idempotencyKey"     uuid NOT NULL,
        "provider"           varchar(10) NOT NULL DEFAULT 'manual',
        "providerPaymentRef" varchar(255),
        "recordedById"       uuid,
        "recordedAt"         timestamptz,
        "createdAt"          timestamptz NOT NULL DEFAULT now(),
        "updatedAt"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payment_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_payment_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_recordedBy" FOREIGN KEY ("recordedById")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payment_tenantId" ON "payment" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_appointmentId" ON "payment" ("appointmentId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_customerId" ON "payment" ("customerId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_payment_idempotencyKey" ON "payment" ("idempotencyKey")`);

    await queryRunner.query(`
      CREATE TABLE "payment_attempt" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "paymentId"            uuid NOT NULL,
        "provider"             varchar(10) NOT NULL,
        "providerEventHandler" varchar(60),
        "providerEventId"      varchar(255),
        "payload"              jsonb,
        "status"               varchar(20) NOT NULL DEFAULT 'RECEIVED',
        "createdAt"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payment_attempt_payment" FOREIGN KEY ("paymentId")
          REFERENCES "payment"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_attempt_paymentId" ON "payment_attempt" ("paymentId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_attempt_provider_eventId" ON "payment_attempt" ("provider", "providerEventId") WHERE "providerEventId" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "refund" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "paymentId"     uuid NOT NULL,
        "amountCents"   int NOT NULL,
        "reason"        varchar(500) NOT NULL,
        "state"         varchar(20) NOT NULL DEFAULT 'PENDING',
        "providerRef"   varchar(255),
        "initiatedById" uuid,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_refund_payment" FOREIGN KEY ("paymentId")
          REFERENCES "payment"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refund_initiatedBy" FOREIGN KEY ("initiatedById")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refund_paymentId" ON "refund" ("paymentId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refund"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_attempt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment"`);
  }
}
