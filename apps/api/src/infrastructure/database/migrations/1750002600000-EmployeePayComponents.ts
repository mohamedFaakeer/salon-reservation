import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payroll module, Phase 6 (DECISIONS.md §69) — allowances and deductions,
 * a curated fixed list rather than an owner-typed generic catalog.
 *
 * `UQ_employee_pay_component_active` allows only one active row per staff
 * member per type — reassigning replaces rather than duplicates.
 * `CHK_employee_pay_component_other_has_reason` requires `reason` whenever
 * `type = 'OTHER_DEDUCTION'`, the one escape-hatch type. Not effective-dated
 * like `employment` — see the entity's own doc for why.
 */
export class EmployeePayComponents1750002600000 implements MigrationInterface {
  name = "EmployeePayComponents1750002600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_pay_component" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"       uuid NOT NULL,
        "staffId"        uuid NOT NULL,
        "type"           varchar(40) NOT NULL,
        "amountCents"    int NOT NULL,
        "epfApplicable"  boolean NOT NULL DEFAULT false,
        "etfApplicable"  boolean NOT NULL DEFAULT false,
        "reason"         varchar(500),
        "active"         boolean NOT NULL DEFAULT true,
        "createdBy"      uuid NOT NULL,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_employee_pay_component_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_pay_component_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_pay_component_created_by" FOREIGN KEY ("createdBy")
          REFERENCES "user"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_employee_pay_component_amount_nonneg" CHECK ("amountCents" >= 0),
        CONSTRAINT "CHK_employee_pay_component_other_has_reason" CHECK (
          "type" <> 'OTHER_DEDUCTION' OR "reason" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_employee_pay_component_tenant_staff" ON "employee_pay_component" ("tenantId", "staffId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employee_pay_component_active" ON "employee_pay_component" ("staffId", "type") WHERE "active" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_pay_component"`);
  }
}
