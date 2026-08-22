import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `customer.marketingOptOut` — a staff-set flag that excludes a customer from
 * win-back/marketing sends. Defaults false so existing customers are
 * reachable unless someone explicitly says otherwise; never touches
 * transactional notifications (booking/payment/reminder), which have no
 * opt-out.
 */
export class CustomerMarketingOptOut1740001300000 implements MigrationInterface {
  name = "CustomerMarketingOptOut1740001300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "marketingOptOut" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN IF EXISTS "marketingOptOut"`);
  }
}
