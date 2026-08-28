/**
 * Refuses to boot production with a secret that is public knowledge.
 *
 * Every value in `.env.example` is in the repository, so any of them appearing
 * in a deployed environment is equivalent to having no secret at all. The
 * length check on JWT_SECRET did not catch this: the committed dev value is 38
 * characters and passed happily, so a deploy that copied `.env.example` into
 * Render would have been signing tokens with a key anyone can read on GitHub.
 *
 * This is deliberately a hard failure rather than a warning. A warning in a
 * deploy log is a warning nobody reads; a process that will not start is a
 * problem somebody fixes before customers exist.
 */

export interface SecretsEnv {
  NODE_ENV?: string;
  JWT_SECRET?: string;
  DATABASE_URL?: string;
  SUPER_ADMIN_PASSWORD?: string;
  CORS_ORIGINS?: string;
  [key: string]: string | undefined;
}

/**
 * Values published in `.env.example`, this file's own examples, and the
 * passwords the migrations used to hardcode. Compared case-insensitively.
 */
const PUBLICLY_KNOWN_VALUES = new Set(
  [
    "dev-only-secret-change-me-min-32-bytes",
    "change-me-strong-password",
    "change-me",
    "changeme",
    "demo1234",
    "super-admin-demo-password-2026",
    "password",
    "secret",
  ].map((v) => v.toLowerCase()),
);

const MIN_JWT_SECRET_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

export function isPubliclyKnown(value: string): boolean {
  return PUBLICLY_KNOWN_VALUES.has(value.trim().toLowerCase());
}

export function isProductionEnv(env: SecretsEnv): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Collects every problem rather than throwing on the first, so one restart
 * tells you everything that needs fixing instead of one thing at a time.
 */
export function findProductionSecretProblems(env: SecretsEnv): string[] {
  if (!isProductionEnv(env)) {
    return [];
  }

  const problems: string[] = [];

  const jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (!jwtSecret) {
    problems.push("JWT_SECRET is not set. Generate one with: openssl rand -base64 48");
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET is ${jwtSecret.length} characters; at least ${MIN_JWT_SECRET_LENGTH} are required (SECURITY.md §13).`,
    );
  } else if (isPubliclyKnown(jwtSecret)) {
    problems.push(
      "JWT_SECRET is the example value from .env.example, which is public in this repository. " +
        "Anyone could forge a token for any account. Generate one with: openssl rand -base64 48",
    );
  }

  const superAdminPassword = env.SUPER_ADMIN_PASSWORD?.trim() ?? "";
  if (superAdminPassword) {
    if (isPubliclyKnown(superAdminPassword)) {
      problems.push(
        "SUPER_ADMIN_PASSWORD is a placeholder published in this repository. Set a real one.",
      );
    } else if (superAdminPassword.length < MIN_PASSWORD_LENGTH) {
      problems.push(
        `SUPER_ADMIN_PASSWORD is ${superAdminPassword.length} characters; at least ${MIN_PASSWORD_LENGTH} are required.`,
      );
    }
  }

  const databaseUrl = env.DATABASE_URL ?? "";
  if (databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")) {
    problems.push("DATABASE_URL points at localhost, which cannot be right in production.");
  }

  // SECURITY_AUDIT_REPORT.md F-02: without this, an unset CORS_ORIGINS makes
  // main.ts's CORS fall back to reflecting any origin AND makes
  // CsrfOriginGuard fall back to allowing every origin — both defenses
  // collapse from one missing variable, silently, unless this check catches
  // it at boot instead.
  if (!env.CORS_ORIGINS?.trim()) {
    problems.push(
      "CORS_ORIGINS is not set. Without it, CORS and the CSRF-origin guard both " +
        "fall back to allowing any origin. Set it to the exact production origins, " +
        "e.g. https://<web>.onrender.com,https://<admin>.onrender.com",
    );
  }

  return problems;
}

/** Throws with every problem listed at once. No-op outside production. */
export function assertProductionSecrets(env: SecretsEnv): void {
  const problems = findProductionSecretProblems(env);
  if (problems.length === 0) {
    return;
  }
  throw new Error(
    [
      `Refusing to start: ${problems.length} insecure production ${
        problems.length === 1 ? "setting" : "settings"
      }.`,
      ...problems.map((p) => `  - ${p}`),
      "",
      "See docs/DEPLOYMENT.md §4 for the full list of required environment variables.",
    ].join("\n"),
  );
}
