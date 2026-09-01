import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Quick Sale can now ring up a genuinely off-catalog "custom item" (name +
 * attribute + price typed in on the spot, no Product/ProductVariant, no
 * stock impact) — the same convention Square/Shopify/Vend use for "sell
 * something not in the catalog yet". `attributeSnapshot` carries the
 * cashier-typed attribute (e.g. "30g") the same way `nameSnapshot` already
 * carries the name. `convertedToVariantId` is set once an OWNER/MANAGER
 * turns a sold custom line into a real catalog `ProductVariant` via
 * `POST /retail-sales/custom-lines/:lineId/convert-to-product` — a line
 * still needs review exactly when `variantId`, `bundleId` AND
 * `convertedToVariantId` are all null, so no separate status column is
 * needed. See docs/DECISIONS.md for the full reasoning (hybrid approach:
 * off-catalog at sale time, catalog-eligible afterward, never automatic).
 */
export class RetailSaleCustomLines1750002000000 implements MigrationInterface {
  name = "RetailSaleCustomLines1750002000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "retail_sale_line" ADD COLUMN IF NOT EXISTS "attributeSnapshot" varchar(80)`);
    await queryRunner.query(`ALTER TABLE "retail_sale_line" ADD COLUMN IF NOT EXISTS "convertedToVariantId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "retail_sale_line" ADD CONSTRAINT "FK_retail_sale_line_converted_variant"
        FOREIGN KEY ("convertedToVariantId") REFERENCES "product_variant"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "retail_sale_line" DROP CONSTRAINT IF EXISTS "FK_retail_sale_line_converted_variant"`,
    );
    await queryRunner.query(`ALTER TABLE "retail_sale_line" DROP COLUMN IF EXISTS "convertedToVariantId"`);
    await queryRunner.query(`ALTER TABLE "retail_sale_line" DROP COLUMN IF EXISTS "attributeSnapshot"`);
  }
}
