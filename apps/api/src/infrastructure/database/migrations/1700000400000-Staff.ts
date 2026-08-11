import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P7 — Staff + qualifications.
 *
 *  1. Creates the `staff` table (DATABASE.md §2.2), with a partial unique
 *     index on (tenantId, userId) so a user can be linked to at most one
 *     staff row per tenant.
 *  2. Creates the `staff_service` join table ("qualifications" — only staff
 *     with a row here can be matched to that service).
 */
export class Staff1700000400000 implements MigrationInterface {
  name = "Staff1700000400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"     uuid NOT NULL,
        "branchId"     uuid,
        "userId"       uuid,
        "name"         varchar(120) NOT NULL,
        "phone"        varchar(32),
        "specialties"  text,
        "active"       boolean NOT NULL DEFAULT true,
        "color"        varchar(7),
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_staff_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_branch" FOREIGN KEY ("branchId")
          REFERENCES "branch"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_staff_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_staff_tenantId" ON "staff" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_staff_tenantId_userId" ON "staff" ("tenantId", "userId") WHERE "userId" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "staff_service" (
        "staffId"    uuid NOT NULL,
        "serviceId"  uuid NOT NULL,
        "tenantId"   uuid NOT NULL,
        CONSTRAINT "PK_staff_service" PRIMARY KEY ("staffId", "serviceId"),
        CONSTRAINT "FK_staff_service_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_service_service" FOREIGN KEY ("serviceId")
          REFERENCES "service"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_service_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_staff_service_tenantId" ON "staff_service" ("tenantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_service"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff"`);
  }
}
