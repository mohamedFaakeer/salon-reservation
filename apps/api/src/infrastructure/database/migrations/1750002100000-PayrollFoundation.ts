import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payroll module, Phase 1 (foundation) — DECISIONS.md §62.
 *
 * Two tables:
 *
 *   - `employment`: how a staff member is paid, effective-dated. Never
 *     edited in place — a pay change closes the currently open row
 *     (`effectiveTo`) and inserts a new one, the same "supersede, don't
 *     overwrite" shape `incentive_payout` already uses.
 *     `UQ_employment_staff_open` is what makes that shape real: at most one
 *     row per staff member may have `effectiveTo IS NULL` at a time, so
 *     there is always exactly one version "in force, or about to be" and the
 *     chain never develops a gap or an overlap.
 *   - `pay_calendar`: the tenant's monthly pay-period cycle (which day of the
 *     month a period starts on). One optional row per tenant — a tenant with
 *     none configured gets the ordinary calendar-month default in code
 *     (`PayCalendarService.resolve`), so this table only holds tenants that
 *     have actually customised it. Daily pay periods need no calendar at all.
 */
export class PayrollFoundation1750002100000 implements MigrationInterface {
  name = "PayrollFoundation1750002100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employment" (
        "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"                uuid NOT NULL,
        "staffId"                 uuid NOT NULL,
        "payFrequency"            varchar(10) NOT NULL,
        "baseRateCents"           int NOT NULL,
        "effectiveFrom"           date NOT NULL,
        "effectiveTo"             date,
        "supersedesEmploymentId"  uuid,
        "createdBy"               uuid NOT NULL,
        "createdAt"               timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_employment_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employment_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employment_supersedes" FOREIGN KEY ("supersedesEmploymentId")
          REFERENCES "employment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_employment_created_by" FOREIGN KEY ("createdBy")
          REFERENCES "user"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_employment_frequency" CHECK ("payFrequency" IN ('MONTHLY', 'DAILY')),
        CONSTRAINT "CHK_employment_rate_nonneg" CHECK ("baseRateCents" >= 0),
        CONSTRAINT "CHK_employment_range_valid" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_employment_tenant_staff" ON "employment" ("tenantId", "staffId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employment_staff_open" ON "employment" ("staffId") WHERE "effectiveTo" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pay_calendar" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"         uuid NOT NULL,
        "monthlyAnchorDay" int NOT NULL DEFAULT 1,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_pay_calendar_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_pay_calendar_anchor_range" CHECK ("monthlyAnchorDay" BETWEEN 1 AND 28)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pay_calendar_tenant" ON "pay_calendar" ("tenantId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pay_calendar"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employment"`);
  }
}
