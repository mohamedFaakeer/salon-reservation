import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Two new tables for the super-admin monitoring feature (DECISIONS.md):
 * `error_log` persists 5xx errors (no third-party error tracker in this
 * project); `security_event_review` is lazily-created operator-triage state
 * for security-relevant `audit_log` rows, kept separate so `audit_log` stays
 * the immutable, general-purpose ledger it already is.
 */
export class MonitoringErrorLogAndSecurityEventReview1750001100000 implements MigrationInterface {
  name = "MonitoringErrorLogAndSecurityEventReview1750001100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "error_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid,
        "requestId" varchar(64),
        "method" varchar(10) NOT NULL,
        "path" varchar(255) NOT NULL,
        "statusCode" int NOT NULL,
        "code" varchar(60) NOT NULL,
        "message" varchar(500) NOT NULL,
        "stack" text,
        "status" varchar(20) NOT NULL DEFAULT 'NEW',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_error_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_error_log_tenantId_createdAt" ON "error_log" ("tenantId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_error_log_status_createdAt" ON "error_log" ("status", "createdAt")`);

    await queryRunner.query(`
      CREATE TABLE "security_event_review" (
        "auditLogId" uuid NOT NULL,
        "status" varchar(20) NOT NULL,
        "reviewedByUserId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_event_review" PRIMARY KEY ("auditLogId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "security_event_review"`);
    await queryRunner.query(`DROP INDEX "IDX_error_log_status_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_error_log_tenantId_createdAt"`);
    await queryRunner.query(`DROP TABLE "error_log"`);
  }
}
