import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P5 — Salon setup.
 *
 *  1. Creates the `closure` table (salon-wide closure dates, DATABASE.md §2.2).
 *  2. Backfills existing tenants still at the original empty-seed settings
 *     ('{}') with real defaults. Scoped to '{}' only so it can never clobber
 *     a tenant that already wrote real settings via PATCH /tenant/me/settings.
 *     Keep this JSON in sync with DEFAULT_TENANT_SETTINGS in
 *     packages/shared/src/tenant-settings.ts.
 */
export class SalonSetup1700000200000 implements MigrationInterface {
  name = "SalonSetup1700000200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "closure" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "startDate"  date NOT NULL,
        "endDate"    date NOT NULL,
        "name"       varchar(120) NOT NULL,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_closure_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_closure_tenantId" ON "closure" ("tenantId")`,
    );

    const defaultSettings = JSON.stringify({
      advanceRule: "NO_ADVANCE",
      advanceValueCents: null,
      cancellationPolicy: {
        selfServiceCutoffHours: 2,
        refundPercentBeforeCutoff: 100,
        refundPercentAfterCutoff: 0,
        noShowRefundPercent: 0,
      },
      bookingWindowDays: 30,
      sameDayLeadMinutes: 120,
      noShowGraceMinutes: 15,
      reminderOffsets: [24, 2],
    });
    await queryRunner.query(
      `UPDATE "tenant" SET "settings" = $1::jsonb WHERE "settings" = '{}'::jsonb`,
      [defaultSettings],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Settings backfill is not reversed (irreversible data migration, same
    // convention as RbacFoundation not un-hashing seeded passwords).
    await queryRunner.query(`DROP TABLE IF EXISTS "closure"`);
  }
}
