import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Gift cards — stored value a salon sold, redeemable across one or more
 * visits until the balance runs out.
 *
 * `CHK_gift_card_balance_range` makes "never negative, never above what it
 * started with" a guarantee the database enforces rather than something
 * `GiftCardService.redeem` is merely trusted to get right under concurrency.
 * `CHK_gift_card_void_has_reason` mirrors `CHK_incentive_payout_void_has_reason`
 * exactly — VOID without a reason is a state nothing downstream can explain.
 *
 * `payment.giftCardId` is a nullable addition to the existing table (SET
 * NULL, never CASCADE — a redemption's own audit trail must outlive the card
 * it drew from), set only on rows where `method = 'GIFT_CARD'`.
 */
export class GiftCards1740001200000 implements MigrationInterface {
  name = "GiftCards1740001200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gift_card" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"              uuid NOT NULL,
        "code"                  varchar(24) NOT NULL,
        "initialValueCents"     int NOT NULL,
        "remainingBalanceCents" int NOT NULL,
        "currency"              varchar(3) NOT NULL DEFAULT 'LKR',
        "purchaserCustomerId"   uuid NOT NULL,
        "recipientName"         varchar(120),
        "recipientPhone"        varchar(32),
        "recipientEmail"        varchar(255),
        "message"               varchar(120),
        "expiresAt"             date NOT NULL,
        "status"                varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "issuedById"            uuid,
        "issuedAt"              timestamptz NOT NULL DEFAULT now(),
        "purchasePaymentId"     uuid,
        "voidedAt"              timestamptz,
        "voidedBy"              uuid,
        "voidReason"            varchar(500),
        CONSTRAINT "FK_gift_card_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_gift_card_purchaser" FOREIGN KEY ("purchaserCustomerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_gift_card_issued_by" FOREIGN KEY ("issuedById")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_gift_card_voided_by" FOREIGN KEY ("voidedBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_gift_card_status"
          CHECK ("status" IN ('ACTIVE', 'REDEEMED', 'VOID')),
        CONSTRAINT "CHK_gift_card_nonneg"
          CHECK ("initialValueCents" >= 0 AND "remainingBalanceCents" >= 0),
        CONSTRAINT "CHK_gift_card_balance_range"
          CHECK ("remainingBalanceCents" >= 0 AND "remainingBalanceCents" <= "initialValueCents"),
        CONSTRAINT "CHK_gift_card_void_has_reason" CHECK (
          "status" <> 'VOID' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_gift_card_code" ON "gift_card" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gift_card_tenant_status" ON "gift_card" ("tenantId", "status")`,
    );

    await queryRunner.query(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "giftCardId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "payment" ADD CONSTRAINT "FK_payment_gift_card"
        FOREIGN KEY ("giftCardId") REFERENCES "gift_card"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_gift_card" ON "payment" ("giftCardId")`,
    );

    // `purchasePaymentId` references `payment`, created after `gift_card` above.
    await queryRunner.query(`
      ALTER TABLE "gift_card" ADD CONSTRAINT "FK_gift_card_purchase_payment"
        FOREIGN KEY ("purchasePaymentId") REFERENCES "payment"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "FK_payment_gift_card"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "giftCardId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gift_card"`);
  }
}
