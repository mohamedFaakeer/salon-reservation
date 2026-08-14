import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P10 — Appointment creation (the heart of the product).
 *
 *  1. `customer` — matched by normalized phone within a tenant (no login).
 *  2. `slot_hold` — 10-minute temporary hold; GiST exclusion constraint
 *     blocks overlapping HELD rows per staff; `sessionKey` doubles as a
 *     booking-level idempotency key (unique per tenant when present).
 *     `bookingSnapshot` (jsonb) carries what `confirmHold` needs to create
 *     the Appointment later, since `POST /payments/:intentId/confirm`'s
 *     body has no service/customer info. Both are deliberate additions
 *     beyond DATABASE.md's bare field list — see DECISIONS.md.
 *  3. `appointment` — created only at confirm time, never at hold time (see
 *     DECISIONS.md for the reserve/confirm timing resolution). GiST
 *     exclusion constraint blocks overlapping active-status rows per staff.
 *  4. `appointment_service` — immutable snapshot line items.
 *
 * `btree_gist` was already enabled by the very first migration
 * (InitialIdentity) in anticipation of this phase.
 */
export class Appointments1700000600000 implements MigrationInterface {
  name = "Appointments1700000600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customer" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "firstName"  varchar(120) NOT NULL,
        "lastName"   varchar(120) NOT NULL,
        "phone"      varchar(32) NOT NULL,
        "email"      varchar(255),
        "notes"      text,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_customer_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_tenantId" ON "customer" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_tenantId_phone" ON "customer" ("tenantId", "phone")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_tenantId_email" ON "customer" ("tenantId", "email") WHERE "email" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "slot_hold" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "staffId"    uuid NOT NULL,
        "startTime"  timestamptz NOT NULL,
        "endTime"    timestamptz NOT NULL,
        "status"     varchar(20) NOT NULL DEFAULT 'HELD',
        "expiresAt"  timestamptz NOT NULL,
        "sessionKey" varchar(64),
        "bookingSnapshot" jsonb,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_slot_hold_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_slot_hold_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_slot_hold_time_range" CHECK ("endTime" > "startTime")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_slot_hold_tenantId" ON "slot_hold" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_slot_hold_status_expiresAt" ON "slot_hold" ("status", "expiresAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_slot_hold_tenantId_sessionKey" ON "slot_hold" ("tenantId", "sessionKey") WHERE "sessionKey" IS NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "slot_hold"
        ADD CONSTRAINT "uq_slot_hold_no_overlap_held"
        EXCLUDE USING gist (
          "staffId" WITH =,
          tstzrange("startTime", "endTime") WITH &&
        )
        WHERE ("status" = 'HELD')
    `);

    await queryRunner.query(`
      CREATE TABLE "appointment" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"             uuid NOT NULL,
        "branchId"             uuid,
        "customerId"           uuid NOT NULL,
        "staffId"              uuid NOT NULL,
        "appointmentDate"      date NOT NULL,
        "startTime"            timestamptz NOT NULL,
        "endTime"              timestamptz NOT NULL,
        "status"               varchar(20) NOT NULL DEFAULT 'CONFIRMED',
        "source"               varchar(20) NOT NULL,
        "subtotalCents"        int NOT NULL,
        "discountCents"        int NOT NULL DEFAULT 0,
        "totalCents"           int NOT NULL,
        "advanceRequiredCents" int NOT NULL DEFAULT 0,
        "advancePaidCents"     int NOT NULL DEFAULT 0,
        "balanceCents"         int NOT NULL,
        "notes"                text,
        "bookingReference"     varchar(20) NOT NULL,
        "holdExpiresAt"        timestamptz,
        "checkedInAt"          timestamptz,
        "inServiceAt"          timestamptz,
        "completedAt"          timestamptz,
        "lateMinutes"          int NOT NULL DEFAULT 0,
        "cancellationReason"   varchar(500),
        "cancelledAt"          timestamptz,
        "rescheduledFromId"    uuid,
        "version"              int NOT NULL DEFAULT 1,
        "createdAt"            timestamptz NOT NULL DEFAULT now(),
        "updatedAt"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_appointment_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointment_branch" FOREIGN KEY ("branchId")
          REFERENCES "branch"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_appointment_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointment_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointment_rescheduledFrom" FOREIGN KEY ("rescheduledFromId")
          REFERENCES "appointment"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_appointment_time_range" CHECK ("endTime" > "startTime")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_tenantId" ON "appointment" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_customerId" ON "appointment" ("customerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_tenantId_appointmentDate_status" ON "appointment" ("tenantId", "appointmentDate", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_staffId_appointmentDate" ON "appointment" ("staffId", "appointmentDate")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_appointment_bookingReference" ON "appointment" ("bookingReference")`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointment"
        ADD CONSTRAINT "uq_appointment_no_overlap_active"
        EXCLUDE USING gist (
          "staffId" WITH =,
          tstzrange("startTime", "endTime") WITH &&
        )
        WHERE ("status" IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','IN_SERVICE'))
    `);

    await queryRunner.query(`
      CREATE TABLE "appointment_service" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "appointmentId"        uuid NOT NULL,
        "serviceId"            uuid,
        "nameSnapshot"         varchar(120) NOT NULL,
        "durationMinSnapshot"  int NOT NULL,
        "priceCentsSnapshot"   int NOT NULL,
        "status"               varchar(10) NOT NULL DEFAULT 'ACTIVE',
        "removedById"          uuid,
        "removedAt"            timestamptz,
        "removedReason"        varchar(500),
        "createdAt"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_appointment_service_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointment_service_service" FOREIGN KEY ("serviceId")
          REFERENCES "service"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_appointment_service_removedBy" FOREIGN KEY ("removedById")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_service_appointmentId" ON "appointment_service" ("appointmentId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "appointment_service"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appointment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "slot_hold"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer"`);
  }
}
