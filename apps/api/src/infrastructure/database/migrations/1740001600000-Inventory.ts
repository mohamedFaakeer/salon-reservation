import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase A of the Inventory + Quick Billing module (DECISIONS.md): retail
 * product sales alongside the existing service-booking business. CLAUDE.md
 * §1.11 names "inventory", "purchases" and "full POS/ERP" as out-of-scope
 * categories; this migration is a deliberately narrow slice of all three —
 * no supplier entity/PO chain, no till sessions, no GL integration.
 *
 * Table order follows the FK dependency chain: product -> product_variant ->
 * stock_receipt -> stock_batch -> stock_movement -> retail_sale ->
 * retail_sale_line -> retail_sale_line_batch. `payment.retailSaleId` is added
 * last, mirroring how `payment.giftCardId` was added after `gift_card` in
 * the gift-cards migration — the referenced table must exist first.
 */
export class Inventory1740001600000 implements MigrationInterface {
  name = "Inventory1740001600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "isWalkInPlaceholder" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"      uuid NOT NULL,
        "name"          varchar(160) NOT NULL,
        "category"      varchar(80),
        "brand"         varchar(120),
        "description"   text,
        "tracksExpiry"  boolean NOT NULL DEFAULT false,
        "trackSerial"   boolean NOT NULL DEFAULT false,
        "active"        boolean NOT NULL DEFAULT true,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_product_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_tenant_active" ON "product" ("tenantId", "active")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variant" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"              uuid NOT NULL,
        "productId"             uuid NOT NULL,
        "sku"                   varchar(64) NOT NULL,
        "barcode"               varchar(64),
        "attributes"            jsonb NOT NULL DEFAULT '{}',
        "priceCents"            int NOT NULL,
        "weightedAvgCostCents"  int NOT NULL DEFAULT 0,
        "quantityOnHand"        int NOT NULL DEFAULT 0,
        "reorderPoint"          int,
        "active"                boolean NOT NULL DEFAULT true,
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_product_variant_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_variant_product" FOREIGN KEY ("productId")
          REFERENCES "product"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_product_variant_qty_nonneg" CHECK ("quantityOnHand" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_variant_tenant_sku" ON "product_variant" ("tenantId", "sku")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_variant_tenant_barcode" ON "product_variant" ("tenantId", "barcode") WHERE "barcode" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_variant_product" ON "product_variant" ("productId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_receipt" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"        uuid NOT NULL,
        "supplierName"    varchar(160),
        "referenceNote"   varchar(500),
        "receivedById"    uuid,
        "receivedAt"      timestamptz NOT NULL DEFAULT now(),
        "totalCostCents"  int NOT NULL DEFAULT 0,
        "createdAt"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_stock_receipt_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_receipt_received_by" FOREIGN KEY ("receivedById")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_receipt_tenant_received_at" ON "stock_receipt" ("tenantId", "receivedAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_batch" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "variantId"         uuid NOT NULL,
        "receiptId"         uuid,
        "lotCode"           varchar(64),
        "expiresAt"         date,
        "serialNumber"      varchar(120),
        "unitCostCents"     int NOT NULL,
        "quantityReceived"  int NOT NULL,
        "quantityRemaining" int NOT NULL,
        "status"            varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_stock_batch_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_batch_variant" FOREIGN KEY ("variantId")
          REFERENCES "product_variant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_batch_receipt" FOREIGN KEY ("receiptId")
          REFERENCES "stock_receipt"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_stock_batch_status"
          CHECK ("status" IN ('ACTIVE', 'DEPLETED', 'QUARANTINED', 'WRITTEN_OFF')),
        CONSTRAINT "CHK_stock_batch_qty_range"
          CHECK ("quantityRemaining" >= 0 AND "quantityRemaining" <= "quantityReceived")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_batch_tenant_variant_status_expiry" ON "stock_batch" ("tenantId", "variantId", "status", "expiresAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_batch_tenant_serial" ON "stock_batch" ("tenantId", "serialNumber") WHERE "serialNumber" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movement" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"       uuid NOT NULL,
        "variantId"      uuid NOT NULL,
        "batchId"        uuid,
        "type"           varchar(20) NOT NULL,
        "quantityDelta"  int NOT NULL,
        "quantityAfter"  int NOT NULL,
        "referenceType"  varchar(40),
        "referenceId"    uuid,
        "reason"         varchar(500),
        "actorUserId"    uuid,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_stock_movement_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_movement_variant" FOREIGN KEY ("variantId")
          REFERENCES "product_variant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_movement_batch" FOREIGN KEY ("batchId")
          REFERENCES "stock_batch"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_movement_actor" FOREIGN KEY ("actorUserId")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_stock_movement_type"
          CHECK ("type" IN ('RECEIPT', 'SALE', 'RETURN_RESTOCK', 'RETURN_QUARANTINE', 'ADJUSTMENT', 'WRITE_OFF'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_movement_tenant_variant_created" ON "stock_movement" ("tenantId", "variantId", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retail_sale" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"       uuid NOT NULL,
        "customerId"     uuid NOT NULL,
        "paymentId"      uuid,
        "subtotalCents"  int NOT NULL,
        "totalCents"     int NOT NULL,
        "soldById"       uuid,
        "status"         varchar(24) NOT NULL DEFAULT 'COMPLETED',
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_retail_sale_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_sale_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_sale_payment" FOREIGN KEY ("paymentId")
          REFERENCES "payment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_retail_sale_sold_by" FOREIGN KEY ("soldById")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_retail_sale_status"
          CHECK ("status" IN ('COMPLETED', 'RETURNED', 'PARTIALLY_RETURNED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_retail_sale_tenant_created" ON "retail_sale" ("tenantId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_retail_sale_customer" ON "retail_sale" ("customerId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retail_sale_line" (
        "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "saleId"                   uuid NOT NULL,
        "variantId"                uuid,
        "nameSnapshot"             varchar(160) NOT NULL,
        "skuSnapshot"              varchar(64) NOT NULL,
        "quantity"                 int NOT NULL,
        "unitPriceCentsSnapshot"   int NOT NULL,
        "unitCostCentsSnapshot"    int NOT NULL,
        "lineTotalCents"           int NOT NULL,
        "createdAt"                timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_retail_sale_line_sale" FOREIGN KEY ("saleId")
          REFERENCES "retail_sale"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_sale_line_variant" FOREIGN KEY ("variantId")
          REFERENCES "product_variant"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_retail_sale_line_qty_positive" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_retail_sale_line_sale" ON "retail_sale_line" ("saleId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retail_sale_line_batch" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "saleLineId"  uuid NOT NULL,
        "batchId"     uuid,
        "quantity"    int NOT NULL,
        CONSTRAINT "FK_retail_sale_line_batch_line" FOREIGN KEY ("saleLineId")
          REFERENCES "retail_sale_line"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retail_sale_line_batch_batch" FOREIGN KEY ("batchId")
          REFERENCES "stock_batch"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_retail_sale_line_batch_line" ON "retail_sale_line_batch" ("saleLineId")`,
    );

    await queryRunner.query(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "retailSaleId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "payment" ADD CONSTRAINT "FK_payment_retail_sale"
        FOREIGN KEY ("retailSaleId") REFERENCES "retail_sale"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_retail_sale" ON "payment" ("retailSaleId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "FK_payment_retail_sale"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "retailSaleId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "retail_sale_line_batch"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "retail_sale_line"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "retail_sale"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_batch"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product"`);
    await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN IF EXISTS "isWalkInPlaceholder"`);
  }
}
