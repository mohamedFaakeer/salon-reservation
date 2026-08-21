import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Incentive payouts — what a stylist was actually paid for one period,
 * frozen the way `invoice` freezes a bill.
 *
 * Four things enforced here rather than trusted to the application:
 *
 *   - `UQ_incentive_payout_live_period`. At most one non-VOID payout per
 *     staff member per period. Correcting a figure voids the old row and
 *     inserts a new one — the partial unique index is what makes "which one
 *     is current" a fact the database can state, the same guarantee
 *     `UQ_invoice_live_per_appointment` gives invoices.
 *   - `CHK_incentive_payout_total`. The three components must actually sum
 *     to the total — the same arithmetic guard `CHK_invoice_amounts` gives
 *     invoices, so a rounding bug in the calculator becomes a write that
 *     fails loudly instead of a payslip that is quietly wrong.
 *   - `CHK_incentive_payout_paid_has_timestamp` /
 *     `CHK_incentive_payout_void_has_reason`. PAID without a payer, or VOID
 *     without a reason, is a state nothing downstream can explain — this
 *     makes both unrepresentable.
 *
 * `planId` is `ON DELETE SET NULL`, never CASCADE: deleting a plan later
 * must not be able to erase what it once paid. `snapshot` is what actually
 * answers "why this number" from then on.
 */
export class IncentivePayouts1740001000000 implements MigrationInterface {
  name = "IncentivePayouts1740001000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "incentive_payout" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"            uuid NOT NULL,
        "staffId"             uuid NOT NULL,
        "planId"              uuid,
        "periodStart"         date NOT NULL,
        "periodEnd"           date NOT NULL,
        "status"              varchar(20) NOT NULL DEFAULT 'FINALISED',
        "revenueCents"        int NOT NULL,
        "commissionCents"     int NOT NULL,
        "jobsCompleted"       int NOT NULL,
        "perJobCents"         int NOT NULL,
        "tierBonusCents"      int NOT NULL,
        "totalCents"          int NOT NULL,
        "snapshot"            jsonb NOT NULL,
        "supersedesPayoutId"  uuid,
        "finalisedBy"         uuid NOT NULL,
        "paidAt"              timestamptz,
        "paidBy"              uuid,
        "voidedAt"            timestamptz,
        "voidedBy"            uuid,
        "voidReason"          varchar(500),
        "createdAt"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_incentive_payout_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_incentive_payout_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_incentive_payout_plan" FOREIGN KEY ("planId")
          REFERENCES "incentive_plan"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_incentive_payout_supersedes" FOREIGN KEY ("supersedesPayoutId")
          REFERENCES "incentive_payout"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_incentive_payout_finalised_by" FOREIGN KEY ("finalisedBy")
          REFERENCES "user"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_incentive_payout_paid_by" FOREIGN KEY ("paidBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_incentive_payout_voided_by" FOREIGN KEY ("voidedBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_incentive_payout_status"
          CHECK ("status" IN ('FINALISED', 'PAID', 'VOID')),
        CONSTRAINT "CHK_incentive_payout_period_order" CHECK ("periodEnd" >= "periodStart"),
        CONSTRAINT "CHK_incentive_payout_nonneg" CHECK (
          "revenueCents" >= 0 AND "commissionCents" >= 0 AND "jobsCompleted" >= 0
          AND "perJobCents" >= 0 AND "tierBonusCents" >= 0 AND "totalCents" >= 0
        ),
        CONSTRAINT "CHK_incentive_payout_total"
          CHECK ("totalCents" = "commissionCents" + "perJobCents" + "tierBonusCents"),
        CONSTRAINT "CHK_incentive_payout_paid_has_timestamp" CHECK (
          "status" <> 'PAID' OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL)
        ),
        CONSTRAINT "CHK_incentive_payout_void_has_reason" CHECK (
          "status" <> 'VOID' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_incentive_payout_live_period"
         ON "incentive_payout" ("staffId", "periodStart", "periodEnd") WHERE "status" <> 'VOID'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incentive_payout_tenant_staff" ON "incentive_payout" ("tenantId", "staffId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "incentive_payout"`);
  }
}
