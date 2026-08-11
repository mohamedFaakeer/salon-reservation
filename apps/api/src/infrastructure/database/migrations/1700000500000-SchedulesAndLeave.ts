import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P8 — Schedules & leave.
 *
 *  1. Creates `working_schedule` (weekly-recurring hours + breaks per
 *     staff member; a missing weekday row means day off).
 *  2. Creates `staff_leave` (date-range leave; overlapping rows for the
 *     same staff member are intentionally allowed — the availability
 *     engine, P9, treats any overlap as unavailable).
 *
 * Closure already exists (P5 migration) — no changes needed here.
 */
export class SchedulesAndLeave1700000500000 implements MigrationInterface {
  name = "SchedulesAndLeave1700000500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "working_schedule" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"       uuid NOT NULL,
        "staffId"        uuid NOT NULL,
        "dayOfWeek"      int NOT NULL,
        "startMin"       int NOT NULL,
        "endMin"         int NOT NULL,
        "breakStartMin"  int,
        "breakEndMin"    int,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_working_schedule_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_working_schedule_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_working_schedule_tenantId" ON "working_schedule" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_working_schedule_staffId_dayOfWeek" ON "working_schedule" ("staffId", "dayOfWeek")`,
    );

    await queryRunner.query(`
      CREATE TABLE "staff_leave" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL,
        "staffId"     uuid NOT NULL,
        "startDate"   date NOT NULL,
        "endDate"     date NOT NULL,
        "reason"      varchar(500),
        "createdBy"   uuid NOT NULL,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_staff_leave_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_leave_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_leave_createdBy" FOREIGN KEY ("createdBy")
          REFERENCES "user"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_staff_leave_tenantId" ON "staff_leave" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_staff_leave_staffId" ON "staff_leave" ("staffId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_leave"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "working_schedule"`);
  }
}
