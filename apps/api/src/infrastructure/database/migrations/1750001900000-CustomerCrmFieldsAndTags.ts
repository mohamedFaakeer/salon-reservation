import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customer CRM fields + tags (DECISIONS.md): richer customer profile fields
 * (title, DOB, profile photo, client source, address, province) plus a real
 * tag entity and its Customer<->Tag join. All new `customer` columns are
 * nullable with no default — every existing row is unaffected until someone
 * fills one in via the new Add/Edit customer drawer. `tag`/`customer_tag`
 * are brand-new tables (a definition/config object and its join, hard-delete
 * fine — see the entities' own doc comments).
 */
export class CustomerCrmFieldsAndTags1750001900000 implements MigrationInterface {
  name = "CustomerCrmFieldsAndTags1750001900000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer"
        ADD COLUMN "title" varchar(40),
        ADD COLUMN "dateOfBirth" date,
        ADD COLUMN "profileImageUrl" varchar(500),
        ADD COLUMN "clientSource" varchar(60),
        ADD COLUMN "address" varchar(255),
        ADD COLUMN "province" varchar(20)
    `);

    await queryRunner.query(`
      CREATE TABLE "tag" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "label" varchar(40) NOT NULL,
        "color" varchar(7),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tag" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tag_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tag_tenantId" ON "tag" ("tenantId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tag_tenantId_label" ON "tag" ("tenantId", "label")`);

    await queryRunner.query(`
      CREATE TABLE "customer_tag" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customerId" uuid NOT NULL,
        "tagId" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_tag" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_tag_customer" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_tag_tag" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_tag_customerId_tagId" ON "customer_tag" ("customerId", "tagId")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_customer_tag_tagId" ON "customer_tag" ("tagId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_customer_tag_tagId"`);
    await queryRunner.query(`DROP INDEX "IDX_customer_tag_customerId_tagId"`);
    await queryRunner.query(`DROP TABLE "customer_tag"`);

    await queryRunner.query(`DROP INDEX "IDX_tag_tenantId_label"`);
    await queryRunner.query(`DROP INDEX "IDX_tag_tenantId"`);
    await queryRunner.query(`DROP TABLE "tag"`);

    await queryRunner.query(`
      ALTER TABLE "customer"
        DROP COLUMN "province",
        DROP COLUMN "address",
        DROP COLUMN "clientSource",
        DROP COLUMN "profileImageUrl",
        DROP COLUMN "dateOfBirth",
        DROP COLUMN "title"
    `);
  }
}
