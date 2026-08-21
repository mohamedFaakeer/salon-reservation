import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Inquiries — a question somebody asked, holding no slot.
 *
 * Kept out of `appointment` on purpose. That table requires "staffId",
 * "appointmentDate", "startTime" and "endTime" NOT NULL and carries the GiST
 * exclusion constraint against double-booking; an inquiry has none of those
 * four, so putting it there would mean relaxing the constraint's own columns
 * for rows that never occupy a slot. See DECISIONS.md.
 *
 * There is no unique constraint here beyond the primary key: the same customer
 * may reasonably ask about the same service twice, and refusing the second
 * question would lose a real one.
 */
export class Inquiries1740000300000 implements MigrationInterface {
  name = "Inquiries1740000300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inquiry" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"         uuid NOT NULL,
        "customerId"       uuid NOT NULL,
        "source"           varchar(20) NOT NULL,
        "status"           varchar(20) NOT NULL DEFAULT 'OPEN',
        "notes"            text,
        "appointmentId"    uuid,
        "createdByUserId"  uuid,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_inquiry_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inquiry_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        -- SET NULL, not CASCADE: the inquiry records that the conversation
        -- happened and must outlive the booking it produced.
        CONSTRAINT "FK_inquiry_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inquiry_created_by" FOREIGN KEY ("createdByUserId")
          REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_inquiry_status"
          CHECK ("status" IN ('OPEN', 'CONVERTED', 'CLOSED')),
        -- A converted inquiry must say which booking it became; anything else
        -- must not carry one. Otherwise "converted" is an unverifiable claim.
        CONSTRAINT "CHK_inquiry_converted_has_appointment" CHECK (
          ("status" = 'CONVERTED' AND "appointmentId" IS NOT NULL)
          OR ("status" <> 'CONVERTED' AND "appointmentId" IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inquiry_tenant_status_created" ON "inquiry" ("tenantId", "status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inquiry_tenant_customer" ON "inquiry" ("tenantId", "customerId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inquiry_service" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "inquiryId"     uuid NOT NULL,
        "serviceId"     uuid,
        "nameSnapshot"  varchar(120) NOT NULL,
        CONSTRAINT "FK_inquiry_service_inquiry" FOREIGN KEY ("inquiryId")
          REFERENCES "inquiry"("id") ON DELETE CASCADE,
        -- The name is snapshotted, so a retired service leaves the line
        -- readable rather than deleting the record of what was asked about.
        CONSTRAINT "FK_inquiry_service_service" FOREIGN KEY ("serviceId")
          REFERENCES "service"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inquiry_service_inquiry" ON "inquiry_service" ("inquiryId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inquiry_service"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inquiry"`);
  }
}
