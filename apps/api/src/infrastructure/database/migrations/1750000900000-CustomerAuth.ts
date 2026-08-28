import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * DECISIONS.md — customer accounts: a platform-level identity (not
 * tenant-scoped) that works across every salon, phone verification by OTP,
 * and the link table connecting an account to each tenant-scoped `Customer`
 * row it books under. Guest booking (phone + reference code) is unaffected —
 * none of this is required to book.
 */
export class CustomerAuth1750000900000 implements MigrationInterface {
  name = "CustomerAuth1750000900000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customer_account" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "firstName"        varchar(120) NOT NULL,
        "lastName"         varchar(120) NOT NULL,
        "phone"            varchar(20) NOT NULL,
        "email"            varchar(255) NOT NULL,
        "passwordHash"     varchar(255) NOT NULL,
        "phoneVerifiedAt"  timestamptz,
        "termsAcceptedAt"  timestamptz NOT NULL,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_account_phone" ON "customer_account" ("phone")`,
    );

    await queryRunner.query(`
      CREATE TABLE "customer_refresh_session" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customerAccountId"     uuid NOT NULL,
        "tokenHash"             varchar(64) NOT NULL,
        "expiresAt"             timestamptz NOT NULL,
        "revokedAt"             timestamptz,
        "replacedBySessionId"   varchar(64),
        "ipAddress"             varchar(64),
        "userAgent"             varchar(255),
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_customer_refresh_session_account" FOREIGN KEY ("customerAccountId")
          REFERENCES "customer_account"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_refresh_session_accountId" ON "customer_refresh_session" ("customerAccountId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_refresh_session_tokenHash" ON "customer_refresh_session" ("tokenHash")`,
    );

    await queryRunner.query(`
      CREATE TABLE "phone_otp" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone"        varchar(20) NOT NULL,
        "purpose"      varchar(30) NOT NULL,
        "codeHash"     varchar(64) NOT NULL,
        "expiresAt"    timestamptz NOT NULL,
        "attempts"     int NOT NULL DEFAULT 0,
        "consumedAt"   timestamptz,
        "createdAt"    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_phone_otp_phone_purpose" ON "phone_otp" ("phone", "purpose")`,
    );

    await queryRunner.query(`
      CREATE TABLE "customer_account_salon_link" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customerAccountId"  uuid NOT NULL,
        "tenantId"           uuid NOT NULL,
        "customerId"         uuid NOT NULL,
        "createdAt"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_customer_account_salon_link_account" FOREIGN KEY ("customerAccountId")
          REFERENCES "customer_account"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_account_salon_link_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_account_salon_link_customer" FOREIGN KEY ("customerId")
          REFERENCES "customer"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_account_salon_link_account_tenant" ON "customer_account_salon_link" ("customerAccountId", "tenantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_account_salon_link_accountId" ON "customer_account_salon_link" ("customerAccountId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_account_salon_link"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "phone_otp"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_refresh_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_account"`);
  }
}
