import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Admin session-timeout hardening (DECISIONS.md, "Session timeout policy"):
 * an absolute session cap needs a way to know when a refresh-token *family*
 * (the chain of rotations descending from one login) originally started,
 * independent of how many times it's been rotated since. `refresh_session`
 * only ever recorded each row's own `createdAt`, which resets on every
 * rotation and can't answer "how long has this login been alive."
 *
 * `familyId` is set to the row's own id on a fresh login and carried forward
 * unchanged through every rotation; `familyStartedAt` is likewise fixed at
 * the original login and copied forward. Existing rows are backfilled with
 * `familyId = id` and `familyStartedAt = "createdAt"` — each one is treated
 * as its own family's origin, which is exactly correct since no earlier
 * session shows any prior family lineage to inherit.
 */
export class RefreshSessionFamily1750002700000 implements MigrationInterface {
  name = "RefreshSessionFamily1750002700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ADD COLUMN IF NOT EXISTS "familyId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ADD COLUMN IF NOT EXISTS "familyStartedAt" timestamptz`,
    );
    await queryRunner.query(
      `UPDATE "refresh_session" SET "familyId" = "id", "familyStartedAt" = "createdAt" WHERE "familyId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ALTER COLUMN "familyId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ALTER COLUMN "familyStartedAt" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_session_familyId" ON "refresh_session" ("familyId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_session_familyId"`);
    await queryRunner.query(`ALTER TABLE "refresh_session" DROP COLUMN IF EXISTS "familyStartedAt"`);
    await queryRunner.query(`ALTER TABLE "refresh_session" DROP COLUMN IF EXISTS "familyId"`);
  }
}
