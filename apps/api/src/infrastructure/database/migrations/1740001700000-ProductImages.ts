import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Optional product/variant photos — same real-HTTPS-URL convention as
 * `tenant.settings.logoUrl` (Cloudinary, never a data: URI). A variant with
 * no image of its own falls back to its parent product's in the UI; neither
 * is required.
 */
export class ProductImages1740001700000 implements MigrationInterface {
  name = "ProductImages1740001700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "imageUrl" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "product_variant" ADD COLUMN IF NOT EXISTS "imageUrl" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN IF EXISTS "imageUrl"`);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "imageUrl"`);
  }
}
