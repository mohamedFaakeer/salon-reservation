import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A discount applied to the bill at the desk, as opposed to one attached to a
 * service.
 *
 * `appointment.discountCents` already existed and already meant "what came off
 * this bill"; it now holds the service offers plus this. The three new columns
 * record the desk's own decision — how it was expressed, what it was worth,
 * and why — because "LKR 500 off" and "10% off" can be the same money today
 * and different money after a service is added, and a receipt that lost which
 * one was meant cannot explain itself.
 *
 * The check constraint is the important one: a bill discount can never exceed
 * what the services actually cost. Without it a mis-typed percentage produces
 * a negative total and a salon that owes its customer money.
 */
export class BillDiscount1740000500000 implements MigrationInterface {
  name = "BillDiscount1740000500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointment"
        ADD COLUMN IF NOT EXISTS "billDiscountType"   varchar(10),
        ADD COLUMN IF NOT EXISTS "billDiscountValue"  int,
        ADD COLUMN IF NOT EXISTS "billDiscountCents"  int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "billDiscountReason" varchar(200)
    `);

    await queryRunner.query(
      `ALTER TABLE "appointment" DROP CONSTRAINT IF EXISTS "CHK_appointment_bill_discount"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointment"
        ADD CONSTRAINT "CHK_appointment_bill_discount" CHECK (
          "billDiscountCents" >= 0
          AND "billDiscountCents" <= "subtotalCents"
          AND ("billDiscountType" IS NULL OR "billDiscountType" IN ('FIXED', 'PERCENT'))
          -- A recorded type must come with the amount it produced, and vice
          -- versa; half a discount is not a state anything can render.
          AND (("billDiscountType" IS NULL) = ("billDiscountValue" IS NULL))
        )
    `);

    // The total can never be negative either, whatever combination of a
    // service offer and a desk discount lands on one bill.
    await queryRunner.query(
      `ALTER TABLE "appointment" DROP CONSTRAINT IF EXISTS "CHK_appointment_total_not_negative"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointment"
        ADD CONSTRAINT "CHK_appointment_total_not_negative" CHECK ("totalCents" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointment" DROP CONSTRAINT IF EXISTS "CHK_appointment_total_not_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment" DROP CONSTRAINT IF EXISTS "CHK_appointment_bill_discount"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointment"
        DROP COLUMN IF EXISTS "billDiscountType",
        DROP COLUMN IF EXISTS "billDiscountValue",
        DROP COLUMN IF EXISTS "billDiscountCents",
        DROP COLUMN IF EXISTS "billDiscountReason"
    `);
  }
}
