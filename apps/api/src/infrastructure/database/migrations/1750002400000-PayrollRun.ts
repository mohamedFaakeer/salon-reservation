import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payroll module, Phase 5 (DECISIONS.md §66) — the payroll run itself: the
 * maker-checker unit spec §13 describes, covering every staff member with
 * an employment profile for one period at once (unlike `incentive_payout`,
 * which is per staff member).
 *
 * `snapshot` (jsonb) holds the frozen per-staff lines as applied —
 * `totalGrossCents`/`totalNetCents`/`staffCount` are duplicated out as real
 * columns purely so a run list can sort/filter without deserializing jsonb,
 * the same reason `invoice` duplicates its own totals out of its own
 * snapshot.
 *
 * `UQ_payroll_run_live_period` allows only one non-VOID run per tenant per
 * exact period — the same supersede-not-edit shape `incentive_payout`
 * already uses: correcting a run voids it and submits a fresh one.
 */
export class PayrollRun1750002400000 implements MigrationInterface {
  name = "PayrollRun1750002400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_run" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"         uuid NOT NULL,
        "periodStart"      date NOT NULL,
        "periodEnd"        date NOT NULL,
        "status"           varchar(20) NOT NULL DEFAULT 'SUBMITTED',
        "staffCount"       int NOT NULL,
        "totalGrossCents"  int NOT NULL,
        "totalNetCents"    int NOT NULL,
        "snapshot"         jsonb NOT NULL,
        "submittedBy"      uuid NOT NULL,
        "approvedBy"       uuid,
        "approvedAt"       timestamptz,
        "paidBy"           uuid,
        "paidAt"           timestamptz,
        "voidedBy"         uuid,
        "voidedAt"         timestamptz,
        "voidReason"       varchar(500),
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payroll_run_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payroll_run_submitted_by" FOREIGN KEY ("submittedBy")
          REFERENCES "user"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payroll_run_approved_by" FOREIGN KEY ("approvedBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_payroll_run_paid_by" FOREIGN KEY ("paidBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_payroll_run_voided_by" FOREIGN KEY ("voidedBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_payroll_run_range_valid" CHECK ("periodEnd" >= "periodStart"),
        CONSTRAINT "CHK_payroll_run_void_has_reason" CHECK (
          ("status" <> 'VOID') OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)
        ),
        CONSTRAINT "CHK_payroll_run_approved_has_timestamp" CHECK (
          ("status" = 'SUBMITTED') OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL)
        ),
        CONSTRAINT "CHK_payroll_run_paid_has_timestamp" CHECK (
          ("status" <> 'PAID') OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payroll_run_tenant" ON "payroll_run" ("tenantId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payroll_run_live_period"
         ON "payroll_run" ("tenantId", "periodStart", "periodEnd") WHERE "status" <> 'VOID'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_run"`);
  }
}
