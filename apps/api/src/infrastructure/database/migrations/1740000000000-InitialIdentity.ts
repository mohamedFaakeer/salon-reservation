import type { MigrationInterface, QueryRunner } from "typeorm";
import argon2 from "argon2";

/**
 * P2 — Identity & auth foundation.
 *
 * Creates the platform/identity tables (tenant, branch, user, user_tenant_role,
 * role, refresh_session), enables btree_gist (used by later phases), and seeds:
 *   - role codes (permission matrix enforced by RolesGuard in P4)
 *   - one SUPER_ADMIN platform user
 *   - one demo tenant (Elegance Salon) with an OWNER login
 */
export class InitialIdentity1700000000000 implements MigrationInterface {
  name = "InitialIdentity1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // ─── tenant ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tenant" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"       varchar(63) NOT NULL,
        "name"       varchar(120) NOT NULL,
        "status"     varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "currency"   varchar(3) NOT NULL DEFAULT 'LKR',
        "timezone"   varchar(63) NOT NULL DEFAULT 'Asia/Colombo',
        "settings"   jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tenant_slug" ON "tenant" ("slug")`);

    // ─── branch ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "branch" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "name"       varchar(120) NOT NULL,
        "address"    varchar(255),
        "phone"      varchar(32),
        "active"     boolean NOT NULL DEFAULT true,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_branch_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_branch_tenantId" ON "branch" ("tenantId")`);

    // ─── user ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email"        varchar(255) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "name"         varchar(120) NOT NULL,
        "status"       varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "lastLoginAt"  timestamptz,
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_email" ON "user" ("email")`);

    // ─── role (seed data) ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "role" (
        "code"        varchar(20) PRIMARY KEY,
        "description" varchar(255) NOT NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "role" ("code", "description") VALUES
        ('SUPER_ADMIN',   'Platform administrator (cross-tenant)'),
        ('OWNER',         'Salon owner — full tenant access'),
        ('MANAGER',       'Salon manager — day-to-day operations'),
        ('RECEPTIONIST',  'Front-desk — bookings, check-in, payments'),
        ('STAFF',         'Service provider — own schedule/appointments only')
    `);

    // ─── user_tenant_role ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "user_tenant_role" (
        "userId"   uuid NOT NULL,
        "tenantId" uuid NOT NULL,
        "role"     varchar(20) NOT NULL CHECK ("role" IN
          ('SUPER_ADMIN','OWNER','MANAGER','RECEPTIONIST','STAFF')),
        "branchId" uuid,
        CONSTRAINT "PK_user_tenant_role" PRIMARY KEY ("userId", "tenantId"),
        CONSTRAINT "FK_utr_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_utr_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_utr_branch" FOREIGN KEY ("branchId")
          REFERENCES "branch"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_utr_branchId" ON "user_tenant_role" ("branchId")`,
    );

    // ─── refresh_session ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "refresh_session" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"               uuid NOT NULL,
        "tokenHash"            varchar(64) NOT NULL,
        "expiresAt"            timestamptz NOT NULL,
        "revokedAt"            timestamptz,
        "replacedBySessionId"  varchar(64),
        "ipAddress"            varchar(64),
        "userAgent"            varchar(255),
        "createdAt"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_refresh_session_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refresh_session_tokenHash" ON "refresh_session" ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_session_userId" ON "refresh_session" ("userId")`,
    );

    // ─── seed: SUPER_ADMIN platform user ───────────────────────
    const superAdminHash = await argon2.hash("super-admin-demo-password-2026");
    await queryRunner.query(
      `INSERT INTO "user" ("email", "passwordHash", "name", "status") VALUES
        ('super.admin@salon.local', $1, 'Platform Admin', 'ACTIVE')`,
      [superAdminHash],
    );

    // ─── seed: demo tenant + owner ─────────────────────────────
    const demoOwnerHash = await argon2.hash("demo1234");
    await queryRunner.query(
      `INSERT INTO "tenant" ("slug", "name") VALUES ('elegance', 'Elegance Salon')`,
    );
    await queryRunner.query(
      `INSERT INTO "branch" ("tenantId", "name") VALUES
        ((SELECT "id" FROM "tenant" WHERE "slug" = 'elegance'), 'Main Branch')`,
    );
    await queryRunner.query(
      `INSERT INTO "user" ("email", "passwordHash", "name", "status") VALUES
        ('owner@demo.salon', $1, 'Demo Owner', 'ACTIVE')`,
      [demoOwnerHash],
    );
    await queryRunner.query(
      `INSERT INTO "user_tenant_role" ("userId", "tenantId", "role", "branchId") VALUES
        (
          (SELECT "id" FROM "user" WHERE "email" = 'owner@demo.salon'),
          (SELECT "id" FROM "tenant" WHERE "slug" = 'elegance'),
          'OWNER',
          (SELECT "id" FROM "branch" WHERE "name" = 'Main Branch')
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_tenant_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branch"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS btree_gist`);
  }
}