import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Service packages — a bundle of prepaid uses of one specific service, sold
 * once and drawn down one use per visit.
 *
 * `CHK_service_package_uses_range` makes "never negative, never above what it
 * started with" a guarantee the database enforces, same posture as
 * `CHK_gift_card_balance_range`. `CHK_service_package_void_has_reason`
 * mirrors `CHK_gift_card_void_has_reason` exactly.
 *
 * `payment.packageRedemptionId` is a nullable addition to the existing table
 * (SET NULL, never CASCADE), set only on rows where
 * `method = 'PACKAGE_CREDIT'`. `service_package.serviceId` is RESTRICT, not
 * SET NULL/CASCADE — an active, spendable balance with no resolvable service
 * is meaningless, so deleting a service with active packages against it must
 * be blocked.
 */
export class ServicePackages1740001400000 implements MigrationInterface {
  name = "ServicePackages1740001400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_package" (
        "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"               uuid NOT NULL,
        "code"                   varchar(24) NOT NULL,
        "customerId"             uuid NOT NULL,
        "serviceId"              uuid NOT NULL,
        "serviceNameSnapshot"    varchar(120) NOT NULL,
        "unitPriceCentsSnapshot" int NOT NULL,
        "totalUses"              int NOT NULL,
        "remainingUses"          int NOT NULL,
        "purchasePriceCents"     int NOT NULL,
        "expiresAt"              date NOT NULL,
        "status"                 varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "issuedById"             uuid,
        "issuedAt"               timestamptz NOT NULL DEFAULT now(),
        "purchasePaymentId"      uuid,
        "voidedAt"               timestamptz,
        "voidedBy"               uuid,
        "voidReason"             varchar(500),
        CONSTRAINT "FK_service_package_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_package_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_package_service" FOREIGN KEY ("serviceId")
          REFERENCES "service"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_service_package_issued_by" FOREIGN KEY ("issuedById")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_service_package_voided_by" FOREIGN KEY ("voidedBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_service_package_status"
          CHECK ("status" IN ('ACTIVE', 'DEPLETED', 'VOID')),
        CONSTRAINT "CHK_service_package_nonneg"
          CHECK ("totalUses" >= 0 AND "remainingUses" >= 0 AND "unitPriceCentsSnapshot" >= 0 AND "purchasePriceCents" >= 0),
        CONSTRAINT "CHK_service_package_uses_range"
          CHECK ("remainingUses" >= 0 AND "remainingUses" <= "totalUses"),
        CONSTRAINT "CHK_service_package_void_has_reason" CHECK (
          "status" <> 'VOID' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_service_package_code" ON "service_package" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_service_package_tenant_status" ON "service_package" ("tenantId", "status")`,
    );

    await queryRunner.query(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "packageRedemptionId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "payment" ADD CONSTRAINT "FK_payment_package_redemption"
        FOREIGN KEY ("packageRedemptionId") REFERENCES "service_package"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_package_redemption" ON "payment" ("packageRedemptionId")`,
    );

    // `purchasePaymentId` references `payment`, created after `service_package` above.
    await queryRunner.query(`
      ALTER TABLE "service_package" ADD CONSTRAINT "FK_service_package_purchase_payment"
        FOREIGN KEY ("purchasePaymentId") REFERENCES "payment"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "FK_payment_package_redemption"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "packageRedemptionId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_package"`);
  }
}
