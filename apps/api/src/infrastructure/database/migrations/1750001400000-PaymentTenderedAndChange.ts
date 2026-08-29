import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * APT-10: a cash payment can now tender more than the outstanding balance
 * (a customer paying with round notes) instead of being hard-rejected —
 * `amountCents` keeps meaning exactly what was applied to the invoice (no
 * existing report/aggregate needs to change), and these two new nullable
 * columns record the physical cash movement for the receipt/audit trail.
 * Both stay null for every payment method other than cash, and for every
 * cash payment that didn't overpay — which is every payment ever recorded
 * before this migration runs.
 */
export class PaymentTenderedAndChange1750001400000 implements MigrationInterface {
  name = "PaymentTenderedAndChange1750001400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "tenderedCents" int`);
    await queryRunner.query(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "changeCents" int`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "changeCents"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "tenderedCents"`);
  }
}
