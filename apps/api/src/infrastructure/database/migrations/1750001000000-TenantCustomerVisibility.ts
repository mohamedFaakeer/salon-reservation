import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lets a platform admin hide a salon from customer-facing discovery/booking
 * without touching `Tenant.status` — that column already gates staff/admin
 * login live, on every request (TenantGuard), and reusing it here would take
 * staff access down along with customer visibility, which is a different,
 * unrelated decision. `DEFAULT true` so every existing tenant's current
 * (fully visible) behavior is unchanged by this migration.
 */
export class TenantCustomerVisibility1750001000000 implements MigrationInterface {
  name = "TenantCustomerVisibility1750001000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant" ADD COLUMN "customerBookingEnabled" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN "customerBookingEnabled"`);
  }
}
