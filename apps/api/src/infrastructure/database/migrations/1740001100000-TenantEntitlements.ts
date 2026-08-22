import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `tenant.entitlements` — the Lite/Pro tier plus per-module, per-report-panel
 * and numeric-limit overrides a SUPER_ADMIN can set per salon.
 *
 * Default `'{}'`, same as `settings`: the entity's `withEntitlementsDefaults`
 * transformer fills in `{ tier: "PRO", moduleOverrides: {}, ... }` on every
 * read, so every existing tenant is full-access (`PRO`) the moment this
 * ships — nothing anyone currently uses disappears. No data backfill needed.
 */
export class TenantEntitlements1740001100000 implements MigrationInterface {
  name = "TenantEntitlements1740001100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "entitlements" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN IF EXISTS "entitlements"`);
  }
}
