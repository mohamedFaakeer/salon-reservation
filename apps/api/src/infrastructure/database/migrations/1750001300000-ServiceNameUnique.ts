import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A service's name must now be unique among a tenant's *active* services,
 * case-insensitively (SVC-02) — a deliberate reversal of the previous "no
 * uniqueness constraint, as designed" behavior, per explicit product
 * decision. Retiring a service frees its name for reuse, so the index is
 * partial (`WHERE active = true`), not table-wide.
 *
 * Safe against existing data: this exact ambiguity was deliberately
 * exercised during UAT (SVC-02's own test created a real duplicate-named
 * pair to prove the old behavior), so a naive `ADD CONSTRAINT UNIQUE` would
 * fail outright against production. The `up` migration renames every
 * duplicate but the most-recently-created row in each colliding group
 * *before* adding the index — automatic, no manual cleanup required, and
 * every renamed row stays active and fully functional under its new name.
 */
export class ServiceNameUnique1750001300000 implements MigrationInterface {
  name = "ServiceNameUnique1750001300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, name,
               ROW_NUMBER() OVER (
                 PARTITION BY "tenantId", LOWER(name)
                 ORDER BY "createdAt" DESC, id DESC
               ) AS rn
        FROM "service"
        WHERE active = true
      )
      UPDATE "service"
      SET name = ranked.name || ' (duplicate ' || ranked.rn || ')'
      FROM ranked
      WHERE "service".id = ranked.id AND ranked.rn > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_service_tenantId_name_active"
      ON "service" ("tenantId", LOWER("name"))
      WHERE "active" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The rename in `up` is a one-way data fix (there is no reliable way to
    // reconstruct the original colliding names) — only the constraint itself
    // is reversed, matching this project's "migrations forward-only in
    // prod, rollback via a new down-migration only in dev" convention.
    await queryRunner.query(`DROP INDEX "IDX_service_tenantId_name_active"`);
  }
}
