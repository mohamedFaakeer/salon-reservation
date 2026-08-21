import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Invoices — what the customer was billed, frozen at issue.
 *
 * Two things are enforced here rather than trusted to the application:
 *
 *   - `UQ_invoice_tenant_number`. Numbering is serialised by locking the
 *     tenant row, but a unique index is what makes that guarantee real: if the
 *     lock is ever bypassed or the code changed, two salons' worth of
 *     simultaneous completions collide loudly instead of silently issuing two
 *     invoices with the same number.
 *   - at most one live invoice per appointment, by partial unique index on
 *     status = 'ISSUED'. Corrections supersede rather than accumulate, and
 *     "which of these three is the current one?" is not a question anybody
 *     should have to answer by reading timestamps.
 *
 * The money columns duplicate figures that also live inside `snapshot`. That
 * is deliberate: they are what a report filters on, and reaching into jsonb
 * for "unpaid invoices this month" is the wrong shape of query.
 */
export class Invoices1740000600000 implements MigrationInterface {
  name = "Invoices1740000600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoice" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"              uuid NOT NULL,
        "appointmentId"         uuid NOT NULL,
        "customerId"            uuid NOT NULL,
        "number"                varchar(40) NOT NULL,
        "version"               int NOT NULL DEFAULT 1,
        "supersedesInvoiceId"   uuid,
        "status"                varchar(20) NOT NULL DEFAULT 'ISSUED',
        "subtotalCents"         int NOT NULL,
        "serviceDiscountCents"  int NOT NULL DEFAULT 0,
        "billDiscountCents"     int NOT NULL DEFAULT 0,
        "totalCents"            int NOT NULL,
        "paidCents"             int NOT NULL DEFAULT 0,
        "balanceCents"          int NOT NULL,
        "currency"              varchar(3) NOT NULL DEFAULT 'LKR',
        "snapshot"              jsonb NOT NULL,
        "lastSentAt"            timestamptz,
        "lastSentTo"            varchar(255),
        "issuedAt"              timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_invoice_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoice_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        -- SET NULL, never CASCADE: deleting an old version must not be able
        -- to take the correction that replaced it.
        CONSTRAINT "FK_invoice_supersedes" FOREIGN KEY ("supersedesInvoiceId")
          REFERENCES "invoice"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_invoice_status"
          CHECK ("status" IN ('ISSUED', 'SUPERSEDED')),
        CONSTRAINT "CHK_invoice_amounts" CHECK (
          "subtotalCents" >= 0
          AND "totalCents" >= 0
          AND "serviceDiscountCents" >= 0
          AND "billDiscountCents" >= 0
          AND "totalCents" = "subtotalCents" - "serviceDiscountCents" - "billDiscountCents"
        )
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoice_tenant_number" ON "invoice" ("tenantId", "number")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoice_live_per_appointment"
         ON "invoice" ("appointmentId") WHERE "status" = 'ISSUED'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_tenant_issued" ON "invoice" ("tenantId", "issuedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice"`);
  }
}
