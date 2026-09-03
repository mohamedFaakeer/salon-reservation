import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payroll module, Phase 5 continued (DECISIONS.md §68) — records how a
 * payroll run was actually paid out (cash acknowledgement note or a bank
 * batch reference), spec §15. Deliberately not a full cash-drawer
 * reconciliation or digital-signature capture — a free-text reference is
 * what "mark paid" already implied trusting the caller to type correctly;
 * this just gives that trust a real, visible record instead of nothing.
 *
 * The existing `CHK_payroll_run_paid_has_timestamp` check is replaced to
 * also require `paymentMethod` whenever `status = 'PAID'`, so a run can no
 * longer be marked paid without saying how.
 */
export class PayrollRunPaymentMethod1750002500000 implements MigrationInterface {
  name = "PayrollRunPaymentMethod1750002500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payroll_run" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "payroll_run" ADD COLUMN IF NOT EXISTS "paymentReference" varchar(255)`);

    await queryRunner.query(`ALTER TABLE "payroll_run" DROP CONSTRAINT IF EXISTS "CHK_payroll_run_paid_has_timestamp"`);
    await queryRunner.query(`
      ALTER TABLE "payroll_run" ADD CONSTRAINT "CHK_payroll_run_paid_has_timestamp" CHECK (
        ("status" <> 'PAID') OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL AND "paymentMethod" IS NOT NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payroll_run" DROP CONSTRAINT IF EXISTS "CHK_payroll_run_paid_has_timestamp"`);
    await queryRunner.query(`
      ALTER TABLE "payroll_run" ADD CONSTRAINT "CHK_payroll_run_paid_has_timestamp" CHECK (
        ("status" <> 'PAID') OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL)
      )
    `);
    await queryRunner.query(`ALTER TABLE "payroll_run" DROP COLUMN IF EXISTS "paymentReference"`);
    await queryRunner.query(`ALTER TABLE "payroll_run" DROP COLUMN IF EXISTS "paymentMethod"`);
  }
}
