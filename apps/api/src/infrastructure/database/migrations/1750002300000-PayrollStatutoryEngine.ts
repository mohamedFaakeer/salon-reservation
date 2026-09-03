import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payroll module, Phase 4 (DECISIONS.md §65) — the statutory (EPF/ETF/APIT)
 * engine's infrastructure, shipped inert everywhere until deliberately
 * turned on.
 *
 * `tenant.statutoryPayrollEnabled` defaults `false` for every tenant,
 * including tenants already on PRO — this is not a plan-tier feature like
 * `payroll`/`incentives` in tenant-entitlements.ts, it's a compliance gate a
 * platform admin flips only once a tenant's configuration has been reviewed
 * by a qualified Sri Lankan payroll/accounting professional.
 *
 * `statutory_rule_set` is global (no `tenantId`) — these are facts about
 * Sri Lankan law, not a per-salon policy. Effective-dated the same way
 * `employment` is (§62's `PayrollFoundation` migration): closing the
 * previous version and opening a new one, never edited in place, so a
 * payroll run finalized under an old table stays reproducible after IRD
 * publishes a new one. `verified` defaults `false` — publishing a rule set
 * at all never itself turns on real calculations for any tenant; that's
 * `tenant.statutoryPayrollEnabled`, a second, independent gate.
 */
export class PayrollStatutoryEngine1750002300000 implements MigrationInterface {
  name = "PayrollStatutoryEngine1750002300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "statutoryPayrollEnabled" boolean NOT NULL DEFAULT false`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "statutory_rule_set" (
        "id"                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "effectiveFrom"                  date NOT NULL,
        "effectiveTo"                    date,
        "epfEmployeePercent"             int NOT NULL,
        "epfEmployerPercent"             int NOT NULL,
        "etfEmployerPercent"             int NOT NULL,
        "apitMonthlyFreeThresholdCents"  int NOT NULL,
        "apitBands"                      jsonb NOT NULL,
        "verified"                       boolean NOT NULL DEFAULT false,
        "sourceNote"                     text NOT NULL,
        "createdBy"                      uuid NOT NULL,
        "createdAt"                      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_statutory_rule_set_created_by" FOREIGN KEY ("createdBy")
          REFERENCES "user"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_statutory_rule_set_percent_range" CHECK (
          "epfEmployeePercent" BETWEEN 0 AND 100
          AND "epfEmployerPercent" BETWEEN 0 AND 100
          AND "etfEmployerPercent" BETWEEN 0 AND 100
        ),
        CONSTRAINT "CHK_statutory_rule_set_threshold_nonneg" CHECK ("apitMonthlyFreeThresholdCents" >= 0),
        CONSTRAINT "CHK_statutory_rule_set_range_valid" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_statutory_rule_set_effective_from" ON "statutory_rule_set" ("effectiveFrom")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "statutory_rule_set"`);
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN IF EXISTS "statutoryPayrollEnabled"`);
  }
}
