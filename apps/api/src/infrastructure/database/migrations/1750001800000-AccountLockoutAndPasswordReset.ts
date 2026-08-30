import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Account lockout v2 (DECISIONS.md): `failedLoginAttempts` replaces the old
 * audit-log-derived sliding-window lockout with a plain persisted counter —
 * once locked there's nothing left to "expire" on a timer. `mustChangePassword`
 * powers the new forced-first-login-change flow for any password set by
 * someone other than the account holder (creation or a reset). Both default
 * to the "nothing has happened yet" value, so every existing row is
 * unaffected until it actually fails a login or gets its password reset.
 *
 * `status` itself needs no migration — it's a plain `varchar(20)` with no
 * CHECK constraint, so the new `"LOCKED"` value is already a legal write.
 */
export class AccountLockoutAndPasswordReset1750001800000 implements MigrationInterface {
  name = "AccountLockoutAndPasswordReset1750001800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
        ADD COLUMN "failedLoginAttempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
        DROP COLUMN "mustChangePassword",
        DROP COLUMN "failedLoginAttempts"
    `);
  }
}
