import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Salon offboarding lifecycle: deactivate (reversible) -> 90-day retention ->
 * purge (anonymize PII, never delete payment/appointment/refund/audit rows —
 * CLAUDE.md's "no hard deletes on business records" rule). See DECISIONS.md's
 * salon-offboarding entry for the full design.
 *
 * All three columns nullable with no default: every existing tenant is
 * unaffected (never deactivated, never purged) until a platform admin acts.
 */
export class TenantOffboarding1750001200000 implements MigrationInterface {
  name = "TenantOffboarding1750001200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant" ADD COLUMN "deletionRequestedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "tenant" ADD COLUMN "purgedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "tenant" ADD COLUMN "deactivationReason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN "deactivationReason"`);
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN "purgedAt"`);
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN "deletionRequestedAt"`);
  }
}
