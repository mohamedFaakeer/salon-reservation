import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Service discounts, and the snapshot columns that record one on a booking.
 *
 * Two decisions are enforced here rather than left to the application:
 *
 *   - one discount per service, by unique index. Overlapping offers would need
 *     precedence rules nobody asked for, and "which one applied?" is not a
 *     question a receipt should answer ambiguously.
 *   - a line's discount can never exceed its own list price, by check
 *     constraint. That is what stops a bad percentage from producing a
 *     negative line and a bill that owes the customer money.
 *
 * `priceCentsSnapshot` deliberately keeps its meaning — the list price at
 * booking. The discount is recorded beside it rather than folded into it, so
 * an invoice can show what was charged *and* what it would have cost, and so
 * no existing row needs rewriting. Charged = price - discount.
 */
export class ServiceDiscounts1740000400000 implements MigrationInterface {
  name = "ServiceDiscounts1740000400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_discount" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "serviceId"  uuid NOT NULL,
        "type"       varchar(10) NOT NULL,
        "value"      int NOT NULL,
        "startDate"  date NOT NULL,
        "endDate"    date NOT NULL,
        "label"      varchar(60),
        "active"     boolean NOT NULL DEFAULT true,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_service_discount_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_discount_service" FOREIGN KEY ("serviceId")
          REFERENCES "service"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_service_discount_type"
          CHECK ("type" IN ('FIXED', 'PERCENT')),
        CONSTRAINT "CHK_service_discount_dates"
          CHECK ("endDate" >= "startDate"),
        -- A percentage above 100 would make the salon pay the customer; a
        -- fixed amount is only bounded by the line's own price, which the
        -- appointment_service check below enforces.
        CONSTRAINT "CHK_service_discount_value" CHECK (
          "value" > 0 AND ("type" <> 'PERCENT' OR "value" <= 100)
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_service_discount_service" ON "service_discount" ("serviceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_service_discount_tenant" ON "service_discount" ("tenantId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_discount_window" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "discountId"  uuid NOT NULL,
        "dayOfWeek"   int NOT NULL,
        "startMin"    int NOT NULL,
        "endMin"      int NOT NULL,
        CONSTRAINT "FK_service_discount_window_discount" FOREIGN KEY ("discountId")
          REFERENCES "service_discount"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_service_discount_window_day"
          CHECK ("dayOfWeek" BETWEEN 0 AND 6),
        -- endMin is exclusive and may reach 1440: "until midnight" is a real
        -- thing to say about an offer.
        CONSTRAINT "CHK_service_discount_window_range" CHECK (
          "startMin" >= 0 AND "endMin" <= 1440 AND "endMin" > "startMin"
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_service_discount_window_discount" ON "service_discount_window" ("discountId")`,
    );

    await queryRunner.query(`
      ALTER TABLE "appointment_service"
        ADD COLUMN IF NOT EXISTS "discountCentsSnapshot" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "discountLabelSnapshot" varchar(60)
    `);
    await queryRunner.query(`
      ALTER TABLE "appointment_service"
        DROP CONSTRAINT IF EXISTS "CHK_appointment_service_discount"
    `);
    await queryRunner.query(`
      ALTER TABLE "appointment_service"
        ADD CONSTRAINT "CHK_appointment_service_discount" CHECK (
          "discountCentsSnapshot" >= 0
          AND "discountCentsSnapshot" <= "priceCentsSnapshot"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointment_service" DROP CONSTRAINT IF EXISTS "CHK_appointment_service_discount"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointment_service"
        DROP COLUMN IF EXISTS "discountCentsSnapshot",
        DROP COLUMN IF EXISTS "discountLabelSnapshot"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_discount_window"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_discount"`);
  }
}
