import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payroll module, Phase 2 (DECISIONS.md §62) needs to know whether a day
 * marked `ON_LEAVE` earns pay before it can fold it into a base-pay
 * calculation — `staff_leave` had no such distinction. Defaults `true` (and
 * backfills every existing row `true`) so nothing already approved is
 * retroactively treated as unpaid; the column only starts changing outcomes
 * once something actually sets it `false`, which today only an API caller
 * can do — there is no admin UI toggle for it yet.
 */
export class StaffLeavePaidFlag1750002200000 implements MigrationInterface {
  name = "StaffLeavePaidFlag1750002200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff_leave" ADD COLUMN IF NOT EXISTS "paid" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff_leave" DROP COLUMN IF EXISTS "paid"`);
  }
}
