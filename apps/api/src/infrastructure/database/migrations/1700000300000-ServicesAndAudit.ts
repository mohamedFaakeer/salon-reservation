import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P6 — Services + Audit Log.
 *
 *  1. Creates the `service` table (DATABASE.md §2.2), with CHECK constraints
 *     on durationMin/priceCents as defense in depth alongside DTO validation.
 *  2. Creates the `audit_log` table (DATABASE.md §2.6 / §4) — the first real
 *     audit infrastructure in this codebase.
 */
export class ServicesAndAudit1700000300000 implements MigrationInterface {
  name = "ServicesAndAudit1700000300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL,
        "branchId"    uuid,
        "name"        varchar(120) NOT NULL,
        "description" text,
        "category"    varchar(60),
        "durationMin" int NOT NULL,
        "priceCents"  int NOT NULL,
        "active"      boolean NOT NULL DEFAULT true,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_service_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_branch" FOREIGN KEY ("branchId")
          REFERENCES "branch"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_service_durationMin" CHECK ("durationMin" > 0),
        CONSTRAINT "CHK_service_priceCents" CHECK ("priceCents" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_service_tenantId" ON "service" ("tenantId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"     uuid,
        "actorUserId"  uuid,
        "action"       varchar(60) NOT NULL,
        "entityType"   varchar(60) NOT NULL,
        "entityId"     varchar(64) NOT NULL,
        "metadata"     jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ipAddress"    varchar(64),
        "userAgent"    varchar(255),
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_audit_log_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_audit_log_actorUser" FOREIGN KEY ("actorUserId")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_log_tenantId_createdAt" ON "audit_log" ("tenantId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service"`);
  }
}
