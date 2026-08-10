import type { MigrationInterface, QueryRunner } from "typeorm";
import argon2 from "argon2";

/**
 * P4 — RBAC foundation.
 *
 *  1. Adds `user.isSuperAdmin` — SUPER_ADMIN has no tenantId, so it can't be
 *     represented in `user_tenant_role` (NOT NULL tenantId). Without this
 *     column, `super.admin@salon.local` could never carry the SUPER_ADMIN
 *     role in its JWT — a latent gap discovered while building RolesGuard.
 *  2. Seeds MANAGER/RECEPTIONIST/STAFF demo users on the "elegance" tenant so
 *     role-based allow/deny (S5) can be e2e-tested against real accounts.
 */
export class RbacFoundation1700000100000 implements MigrationInterface {
  name = "RbacFoundation1700000100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "isSuperAdmin" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "user" SET "isSuperAdmin" = true WHERE "email" = 'super.admin@salon.local'`,
    );

    const demoUsers: Array<{ email: string; name: string; role: string }> = [
      { email: "manager@demo.salon", name: "Demo Manager", role: "MANAGER" },
      { email: "receptionist@demo.salon", name: "Demo Receptionist", role: "RECEPTIONIST" },
      { email: "staff@demo.salon", name: "Demo Staff", role: "STAFF" },
    ];

    for (const demoUser of demoUsers) {
      const passwordHash = await argon2.hash("demo1234");
      await queryRunner.query(
        `INSERT INTO "user" ("email", "passwordHash", "name", "status") VALUES
          ($1, $2, $3, 'ACTIVE')`,
        [demoUser.email, passwordHash, demoUser.name],
      );
      await queryRunner.query(
        `INSERT INTO "user_tenant_role" ("userId", "tenantId", "role", "branchId") VALUES
          (
            (SELECT "id" FROM "user" WHERE "email" = $1),
            (SELECT "id" FROM "tenant" WHERE "slug" = 'elegance'),
            $2,
            (SELECT "id" FROM "branch" WHERE "name" = 'Main Branch')
          )`,
        [demoUser.email, demoUser.role],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_tenant_role" WHERE "userId" IN (
        SELECT "id" FROM "user" WHERE "email" IN
          ('manager@demo.salon', 'receptionist@demo.salon', 'staff@demo.salon')
      )
    `);
    await queryRunner.query(`
      DELETE FROM "user" WHERE "email" IN
        ('manager@demo.salon', 'receptionist@demo.salon', 'staff@demo.salon')
    `);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isSuperAdmin"`);
  }
}
