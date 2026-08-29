import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Real stylist photos on the public salon page, plus a job title and
 * display-only gender — the customer site currently renders a stock photo
 * and a name only. All three nullable, no default: every existing stylist
 * simply has none of these set until an owner/manager fills them in, and
 * every render site must (and does) treat that as the normal case, not an
 * error state.
 */
export class StaffPhotoGenderJobTitle1750001500000 implements MigrationInterface {
  name = "StaffPhotoGenderJobTitle1750001500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "imageUrl" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "jobTitle" varchar(80)`);
    await queryRunner.query(`ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "gender" varchar(10)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "staff" DROP COLUMN "gender"`);
    await queryRunner.query(`ALTER TABLE "staff" DROP COLUMN "jobTitle"`);
    await queryRunner.query(`ALTER TABLE "staff" DROP COLUMN "imageUrl"`);
  }
}
