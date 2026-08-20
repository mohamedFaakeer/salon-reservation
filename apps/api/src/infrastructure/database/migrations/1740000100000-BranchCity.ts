import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `branch.city`.
 *
 * UX.md §3.2 asks the customer-facing salon cards to show a city and the home
 * search to match on "name/city", but the only location field was a free-text
 * `address`. Splitting a city out of that string is guesswork — "42 Galle Road,
 * Colombo 03" has no reliable city token — so it becomes its own column that
 * the salon fills in from Settings.
 *
 * Nullable with no backfill: an existing branch has no city until someone
 * types one, and the cards fall back to the address.
 */
export class BranchCity1740000100000 implements MigrationInterface {
  name = "BranchCity1740000100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "city" varchar(80)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_branch_city" ON "branch" ("city")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_branch_city"`);
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN IF EXISTS "city"`);
  }
}
