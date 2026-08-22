import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase B of the Inventory + Quick Billing module: bundles (kits sold as one
 * line, availability always computed live from components — never stored)
 * and returns (restock or quarantine per line, with an optional staff-
 * entered refund via the existing Payment/Refund machinery).
 *
 * `retail_sale_line.skuSnapshot` becomes nullable — a bundle line has no SKU
 * of its own in Phase B — and gains `bundleId`, mirroring the existing
 * nullable `variantId` (exactly one of the two is ever set per line).
 */
export class BundlingAndReturns1740001800000 implements MigrationInterface {
  name = "BundlingAndReturns1740001800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_bundle" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "name"       varchar(160) NOT NULL,
        "priceCents" int NOT NULL,
        "active"     boolean NOT NULL DEFAULT true,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_product_bundle_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_bundle_tenant_active" ON "product_bundle" ("tenantId", "active")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_bundle_component" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bundleId"          uuid NOT NULL,
        "variantId"         uuid NOT NULL,
        "quantityPerBundle" int NOT NULL,
        CONSTRAINT "FK_product_bundle_component_bundle" FOREIGN KEY ("bundleId")
          REFERENCES "product_bundle"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_bundle_component_variant" FOREIGN KEY ("variantId")
          REFERENCES "product_variant"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_product_bundle_component_qty_positive" CHECK ("quantityPerBundle" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_bundle_component_bundle_variant" ON "product_bundle_component" ("bundleId", "variantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_bundle_component_variant" ON "product_bundle_component" ("variantId")`,
    );

    await queryRunner.query(`ALTER TABLE "retail_sale_line" ALTER COLUMN "skuSnapshot" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "retail_sale_line" ADD COLUMN IF NOT EXISTS "bundleId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "retail_sale_line" ADD CONSTRAINT "FK_retail_sale_line_bundle"
        FOREIGN KEY ("bundleId") REFERENCES "product_bundle"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retail_return" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"       uuid NOT NULL,
        "saleId"         uuid NOT NULL,
        "processedById"  uuid,
        "reason"         varchar(500) NOT NULL,
        "refundId"       uuid,
        "refundedCents"  int NOT NULL DEFAULT 0,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_retail_return_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_return_sale" FOREIGN KEY ("saleId")
          REFERENCES "retail_sale"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_return_processed_by" FOREIGN KEY ("processedById")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_retail_return_refund" FOREIGN KEY ("refundId")
          REFERENCES "refund"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_retail_return_tenant_sale" ON "retail_return" ("tenantId", "saleId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retail_return_line" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "returnId"     uuid NOT NULL,
        "saleLineId"   uuid NOT NULL,
        "quantity"     int NOT NULL,
        "disposition"  varchar(20) NOT NULL,
        CONSTRAINT "FK_retail_return_line_return" FOREIGN KEY ("returnId")
          REFERENCES "retail_return"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_return_line_sale_line" FOREIGN KEY ("saleLineId")
          REFERENCES "retail_sale_line"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_retail_return_line_qty_positive" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_retail_return_line_disposition" CHECK ("disposition" IN ('RESTOCK', 'QUARANTINE'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_retail_return_line_sale_line" ON "retail_return_line" ("saleLineId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "retail_return_line"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "retail_return"`);
    await queryRunner.query(`ALTER TABLE "retail_sale_line" DROP CONSTRAINT IF EXISTS "FK_retail_sale_line_bundle"`);
    await queryRunner.query(`ALTER TABLE "retail_sale_line" DROP COLUMN IF EXISTS "bundleId"`);
    await queryRunner.query(`ALTER TABLE "retail_sale_line" ALTER COLUMN "skuSnapshot" SET NOT NULL`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_bundle_component"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_bundle"`);
  }
}
