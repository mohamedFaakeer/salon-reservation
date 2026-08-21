import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Attendance corrections — a request, a reason, and a decision.
 *
 * `attendanceId` is nullable for the commoner case: a check-in nobody ever
 * pressed has no row to reference, only a date and a claim about it. It is
 * SET NULL rather than CASCADE for the same reason `invoice.supersedesInvoiceId`
 * is: the correction request must survive even if the day it corrected is
 * later removed some other way, because it is itself the audit trail of a
 * decision somebody made.
 *
 * Two things are enforced here rather than trusted to the application:
 *
 *   - `UQ_attendance_edit_pending`. At most one open request per person per
 *     day. Without it a manager reviewing the queue could be looking at two
 *     contradictory asks for the same afternoon with no way to know which is
 *     current — the partial index (only over PENDING rows) makes "current"
 *     a fact the database can state rather than the newest timestamp the
 *     app happens to sort by.
 *   - `CHK_attendance_edit_decided`. A decided request without a decider and
 *     a timestamp, or an undecided one that already has them, is a state
 *     nothing in the product can explain — this makes it unrepresentable.
 */
export class AttendanceEditRequests1740000800000 implements MigrationInterface {
  name = "AttendanceEditRequests1740000800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_edit_request" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"              uuid NOT NULL,
        "staffId"               uuid NOT NULL,
        "attendanceId"          uuid,
        "workDate"              date NOT NULL,
        "previousCheckInAt"     timestamptz,
        "previousCheckOutAt"    timestamptz,
        "requestedCheckInAt"    timestamptz,
        "requestedCheckOutAt"   timestamptz,
        "reason"                varchar(500) NOT NULL,
        "status"                varchar(20) NOT NULL DEFAULT 'PENDING',
        "requestedBy"           uuid NOT NULL,
        "decidedBy"             uuid,
        "decidedAt"             timestamptz,
        "decisionNote"          varchar(500),
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_attendance_edit_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_edit_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_edit_attendance" FOREIGN KEY ("attendanceId")
          REFERENCES "attendance_day"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_attendance_edit_requested_by" FOREIGN KEY ("requestedBy")
          REFERENCES "user"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_attendance_edit_decided_by" FOREIGN KEY ("decidedBy")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_attendance_edit_status"
          CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
        CONSTRAINT "CHK_attendance_edit_decided" CHECK (
          ("status" IN ('PENDING', 'WITHDRAWN') AND "decidedBy" IS NULL AND "decidedAt" IS NULL)
          OR ("status" IN ('APPROVED', 'REJECTED') AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL)
        ),
        CONSTRAINT "CHK_attendance_edit_requested_order" CHECK (
          "requestedCheckOutAt" IS NULL OR "requestedCheckOutAt" > "requestedCheckInAt"
        ),
        CONSTRAINT "CHK_attendance_edit_has_request" CHECK (
          "requestedCheckInAt" IS NOT NULL OR "requestedCheckOutAt" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendance_edit_pending"
         ON "attendance_edit_request" ("staffId", "workDate") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attendance_edit_tenant_status"
         ON "attendance_edit_request" ("tenantId", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_edit_request"`);
  }
}
