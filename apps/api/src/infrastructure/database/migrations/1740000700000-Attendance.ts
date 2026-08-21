import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Attendance — who was here, and when.
 *
 * Three things are decided by the database rather than trusted to the app:
 *
 *   - `UQ_attendance_staff_day`. One attendance day per person per date. Two
 *     taps on a slow connection, or the front desk punching somebody in who
 *     had already punched themselves in, must collide loudly instead of
 *     quietly producing two shifts for one afternoon.
 *   - `CHK_attendance_out_after_in`. A check-out that precedes its check-in is
 *     not a short day, it is corrupt data, and once written it would flow
 *     straight into hours worked.
 *   - `CHK_attendance_minutes`. Lateness and early departure are magnitudes.
 *     A negative one would mean an early arrival cancelling out a colleague's
 *     late one when a month is summed.
 *
 * `checkInAt` is NOT NULL because a row is *created* by a check-in: there is
 * no such thing as a day that only has a departure. The missing-check-out case
 * — far commoner — is the nullable end.
 *
 * The `expected*` and `*grace*` columns duplicate what `working_schedule` and
 * `tenant.settings` say today. That duplication is the point: they record what
 * the shift was judged against at the time, so editing a rota cannot rewrite
 * last month's lateness.
 */
export class Attendance1740000700000 implements MigrationInterface {
  name = "Attendance1740000700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_day" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "staffId"           uuid NOT NULL,
        "workDate"          date NOT NULL,
        "checkInAt"         timestamptz NOT NULL,
        "checkOutAt"        timestamptz,
        "checkInBy"         uuid,
        "checkOutBy"        uuid,
        "expectedStartMin"  int,
        "expectedEndMin"    int,
        "graceMinutes"      int NOT NULL DEFAULT 0,
        "earlyGraceMinutes" int NOT NULL DEFAULT 0,
        "lateMinutes"       int NOT NULL DEFAULT 0,
        "earlyMinutes"      int NOT NULL DEFAULT 0,
        "workedMinutes"     int,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_attendance_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        -- SET NULL, never CASCADE: removing a receptionist's login must not
        -- delete the attendance of everyone they ever punched in.
        CONSTRAINT "FK_attendance_check_in_by" FOREIGN KEY ("checkInBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_attendance_check_out_by" FOREIGN KEY ("checkOutBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_attendance_out_after_in"
          CHECK ("checkOutAt" IS NULL OR "checkOutAt" > "checkInAt"),
        CONSTRAINT "CHK_attendance_minutes"
          CHECK ("lateMinutes" >= 0 AND "earlyMinutes" >= 0)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendance_staff_day"
         ON "attendance_day" ("staffId", "workDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attendance_tenant_day"
         ON "attendance_day" ("tenantId", "workDate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_day"`);
  }
}
