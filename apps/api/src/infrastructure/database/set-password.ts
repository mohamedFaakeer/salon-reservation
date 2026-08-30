/**
 * Rotate a user's password against an existing database.
 *
 * Migrations only decide what a *fresh* database gets. Anything already
 * deployed keeps the credentials it was created with, and a leak is not a
 * reason to rebuild a database — so rotation needs its own path.
 *
 * Usage:
 *   npm run user:set-password -w apps/api -- --email owner@demo.salon --password '…'
 *   npm run user:set-password -w apps/api -- --email admin@salon.io --generate
 *
 * Reads DATABASE_URL from the environment, exactly like the app does.
 */
import "reflect-metadata";
import path from "node:path";
import argon2 from "argon2";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { isPubliclyKnown } from "../../common/security/production-secrets";
import { PasswordService } from "../../auth/services/password.service";

// Same two-step lookup data-source.ts uses, so this runs with no extra setup
// whether invoked from apps/api or the repository root.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const MIN_LENGTH = 12;

interface Args {
  email: string;
  password?: string;
  generate: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  const email = typeof args.email === "string" ? args.email.trim() : "";
  if (!email) {
    throw new Error("--email is required.");
  }
  return {
    email,
    password: typeof args.password === "string" ? args.password : undefined,
    generate: args.generate === true,
  };
}

// Same generator the in-app reset endpoints use (`PasswordService.generate`)
// — one strength policy, never a separate one for the CLI path.
const passwords = new PasswordService();

function resolvePassword(args: Args): { password: string; generated: boolean } {
  if (args.generate) {
    return { password: passwords.generate(), generated: true };
  }
  if (!args.password) {
    throw new Error("Pass --password '<value>' or --generate.");
  }
  // Checked before length so the specific reason wins: "must be 12 characters"
  // would send someone off to pad "demo1234" into "demo12345678".
  //
  // Refused outright in production; merely noted elsewhere, because restoring
  // a known development password on a laptop is a legitimate thing to do and
  // the same rule as the migrations should apply.
  if (isPubliclyKnown(args.password)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("That password is published in this repository. Choose another.");
    }
    process.stderr.write(
      "Note: that password is published in this repository. Fine locally, never in production.\n",
    );
    return { password: args.password, generated: false };
  }
  if (args.password.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
  }
  return { password: args.password, generated: false };
}

/**
 * TypeORM's postgres driver returns `[rows, affectedCount]` from an
 * `UPDATE ... RETURNING`, not the rows alone. Reading `.length` off that
 * wrapper is always 2, so a rotation against an address that does not exist
 * reported success — exactly the case this script must not get wrong.
 */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return (result[0] as unknown[]).length;
  }
  return Array.isArray(result) ? result.length : 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { password, generated } = resolvePassword(args);

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }

  const dataSource = new DataSource({
    type: "postgres",
    url,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  await dataSource.initialize();

  try {
    const passwordHash = await argon2.hash(password);
    const updated = affectedRows(
      await dataSource.query(
        `UPDATE "user" SET "passwordHash" = $1, "updatedAt" = now() WHERE lower("email") = lower($2) RETURNING "email"`,
        [passwordHash, args.email],
      ),
    );

    if (updated === 0) {
      throw new Error(`No user with email ${args.email}.`);
    }

    // Existing sessions were issued against the old credential; a rotation
    // that leaves them valid has not actually revoked anything.
    const revoked = affectedRows(
      await dataSource.query(
        `UPDATE "refresh_session" SET "revokedAt" = now()
       WHERE "userId" = (SELECT "id" FROM "user" WHERE lower("email") = lower($1))
         AND "revokedAt" IS NULL
       RETURNING "id"`,
        [args.email],
      ),
    );

    process.stdout.write(`Password updated for ${args.email}.\n`);
    process.stdout.write(`Revoked ${revoked} active session(s).\n`);
    if (generated) {
      process.stdout.write(`\n  ${password}\n\n`);
      process.stdout.write("Store it now — it is not saved anywhere.\n");
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
