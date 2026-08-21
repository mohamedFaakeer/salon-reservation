import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customer ratings.
 *
 * One rating per appointment, enforced by a unique constraint rather than a
 * check-then-insert: two taps on a slow connection must not produce two rows.
 *
 * `tenantId` is denormalised onto the row so a salon's ratings can be read and
 * scoped without joining through the appointment every time — the same reason
 * every other table in this schema carries it.
 */
export class Ratings1740000200000 implements MigrationInterface {
  name = "Ratings1740000200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rating" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"       uuid NOT NULL,
        "appointmentId"  uuid NOT NULL,
        "customerId"     uuid NOT NULL,
        "staffId"        uuid,
        "score"          smallint NOT NULL,
        "comment"        varchar(1000),
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_rating_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rating_appointment" FOREIGN KEY ("appointmentId")
          REFERENCES "appointment"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rating_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rating_staff" FOREIGN KEY ("staffId")
          REFERENCES "staff"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_rating_score" CHECK ("score" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_rating_appointment" ON "rating" ("appointmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rating_tenant_customer" ON "rating" ("tenantId", "customerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rating_tenant_staff" ON "rating" ("tenantId", "staffId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rating"`);
  }
}
