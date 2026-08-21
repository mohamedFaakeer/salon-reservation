import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Incentive plans — how a stylist earns beyond a wage.
 *
 * Three things enforced here rather than trusted to the application:
 *
 *   - `CHK_incentive_plan_has_component`. A plan with base commission, flat
 *     per-job amount, and tier bonus all null pays nothing — that is a
 *     configuration mistake made once at setup, not a state a payout run
 *     should discover.
 *   - `CHK_incentive_plan_tier_paired`. A target with no bonus rate does
 *     nothing; a bonus rate with no target is unbounded. They are set or
 *     cleared together.
 *   - `UQ_incentive_rate_plan_service`. A service names at most one
 *     override rate per plan — a second row for the same pair would be an
 *     edit that never happened, not a second fact.
 *
 * `staff.incentivePlanId` is added here rather than in a separate migration:
 * a plan with nobody assignable to it is not useful on its own, and shipping
 * the column with the table it points at keeps the two from landing out of
 * order in a fresh database.
 */
export class IncentivePlans1740000900000 implements MigrationInterface {
  name = "IncentivePlans1740000900000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "incentive_plan" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"              uuid NOT NULL,
        "name"                  varchar(80) NOT NULL,
        "baseCommissionPercent" int,
        "perJobAmountCents"     int,
        "monthlyTargetCents"    int,
        "tierBonusPercent"      int,
        "active"                boolean NOT NULL DEFAULT true,
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_incentive_plan_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_incentive_plan_percent_range" CHECK (
          ("baseCommissionPercent" IS NULL OR "baseCommissionPercent" BETWEEN 0 AND 100)
          AND ("tierBonusPercent" IS NULL OR "tierBonusPercent" BETWEEN 0 AND 100)
        ),
        CONSTRAINT "CHK_incentive_plan_amounts_nonneg" CHECK (
          ("perJobAmountCents" IS NULL OR "perJobAmountCents" >= 0)
          AND ("monthlyTargetCents" IS NULL OR "monthlyTargetCents" >= 0)
        ),
        CONSTRAINT "CHK_incentive_plan_has_component" CHECK (
          "baseCommissionPercent" IS NOT NULL
          OR "perJobAmountCents" IS NOT NULL
          OR ("monthlyTargetCents" IS NOT NULL AND "tierBonusPercent" IS NOT NULL)
        ),
        CONSTRAINT "CHK_incentive_plan_tier_paired" CHECK (
          ("monthlyTargetCents" IS NULL) = ("tierBonusPercent" IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incentive_plan_tenant" ON "incentive_plan" ("tenantId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "incentive_plan_service_rate" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "planId"      uuid NOT NULL,
        "serviceId"   uuid NOT NULL,
        "ratePercent" int NOT NULL,
        CONSTRAINT "FK_incentive_rate_plan" FOREIGN KEY ("planId")
          REFERENCES "incentive_plan"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_incentive_rate_service" FOREIGN KEY ("serviceId")
          REFERENCES "service"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_incentive_rate_percent_range" CHECK ("ratePercent" BETWEEN 0 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_incentive_rate_plan_service"
         ON "incentive_plan_service_rate" ("planId", "serviceId")`,
    );

    await queryRunner.query(`ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "incentivePlanId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "staff" ADD CONSTRAINT "FK_staff_incentive_plan"
        FOREIGN KEY ("incentivePlanId") REFERENCES "incentive_plan"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "FK_staff_incentive_plan"`);
    await queryRunner.query(`ALTER TABLE "staff" DROP COLUMN IF EXISTS "incentivePlanId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incentive_plan_service_rate"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incentive_plan"`);
  }
}
