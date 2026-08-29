import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Powers the customer site's "Get Directions" link. Both nullable, no
 * default — every existing branch simply has no location set until an
 * owner fills it in, and every render site (salon page, booking
 * confirmation) already hides the button entirely when either is absent.
 */
export class BranchGeolocation1750001600000 implements MigrationInterface {
  name = "BranchGeolocation1750001600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "branch" ADD COLUMN IF NOT EXISTS "longitude" double precision`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "branch" DROP COLUMN "latitude"`);
  }
}
