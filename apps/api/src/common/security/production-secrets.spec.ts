import {
  assertProductionSecrets,
  findProductionSecretProblems,
  isPubliclyKnown,
} from "./production-secrets";

const STRONG_SECRET = "S6nq2Yy0RmTt4bV9pWjK1xLzE7cAgHdNfQuZ3rXo";
const STRONG_PASSWORD = "quiet-harbour-lantern-92";

describe("production secrets guard", () => {
  describe("outside production", () => {
    it("allows the committed dev values, so local work needs no configuration", () => {
      const problems = findProductionSecretProblems({
        NODE_ENV: "development",
        JWT_SECRET: "dev-only-secret-change-me-min-32-bytes",
        SUPER_ADMIN_PASSWORD: "change-me-strong-password",
        DATABASE_URL: "postgresql://salon:salon@localhost:5432/salon",
      });

      expect(problems).toEqual([]);
    });
  });

  describe("in production", () => {
    const base = {
      NODE_ENV: "production",
      JWT_SECRET: STRONG_SECRET,
      SUPER_ADMIN_PASSWORD: STRONG_PASSWORD,
      DATABASE_URL: "postgresql://user:pw@ep-neon.aws.neon.tech/salon?sslmode=require",
      CORS_ORIGINS: "https://web.example.com,https://admin.example.com",
    };

    it("accepts a properly configured environment", () => {
      expect(findProductionSecretProblems(base)).toEqual([]);
    });

    it("rejects the example JWT secret even though it is long enough", () => {
      // The whole point: this value is 38 characters, so the pre-existing
      // length check passed it while it remained readable on GitHub.
      const devSecret = "dev-only-secret-change-me-min-32-bytes";
      expect(devSecret.length).toBeGreaterThanOrEqual(32);

      const problems = findProductionSecretProblems({ ...base, JWT_SECRET: devSecret });

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("public in this repository");
    });

    it("rejects a missing JWT secret", () => {
      const problems = findProductionSecretProblems({ ...base, JWT_SECRET: undefined });
      expect(problems[0]).toContain("JWT_SECRET is not set");
    });

    it("rejects a short JWT secret", () => {
      const problems = findProductionSecretProblems({ ...base, JWT_SECRET: "too-short" });
      expect(problems[0]).toContain("at least 32");
    });

    it("rejects the placeholder super-admin password", () => {
      const problems = findProductionSecretProblems({
        ...base,
        SUPER_ADMIN_PASSWORD: "change-me-strong-password",
      });
      expect(problems[0]).toContain("placeholder");
    });

    it("rejects the old hardcoded demo passwords", () => {
      expect(isPubliclyKnown("demo1234")).toBe(true);
      expect(isPubliclyKnown("super-admin-demo-password-2026")).toBe(true);
    });

    it("ignores an unset super-admin password, which simply means no seeding", () => {
      const problems = findProductionSecretProblems({
        ...base,
        SUPER_ADMIN_PASSWORD: undefined,
      });
      expect(problems).toEqual([]);
    });

    it("catches a database URL still pointing at localhost", () => {
      const problems = findProductionSecretProblems({
        ...base,
        DATABASE_URL: "postgresql://salon:salon@localhost:5432/salon",
      });
      expect(problems[0]).toContain("localhost");
    });

    it("rejects a missing CORS_ORIGINS (SECURITY_AUDIT_REPORT.md F-02)", () => {
      const problems = findProductionSecretProblems({ ...base, CORS_ORIGINS: undefined });
      expect(problems[0]).toContain("CORS_ORIGINS is not set");
    });

    it("rejects a blank CORS_ORIGINS the same as unset", () => {
      const problems = findProductionSecretProblems({ ...base, CORS_ORIGINS: "   " });
      expect(problems[0]).toContain("CORS_ORIGINS is not set");
    });

    it("reports every problem at once rather than one per restart", () => {
      const problems = findProductionSecretProblems({
        NODE_ENV: "production",
        JWT_SECRET: "dev-only-secret-change-me-min-32-bytes",
        SUPER_ADMIN_PASSWORD: "demo1234",
        DATABASE_URL: "postgresql://salon:salon@localhost:5432/salon",
        CORS_ORIGINS: undefined,
      });

      expect(problems).toHaveLength(4);
    });

    it("throws with all problems listed", () => {
      expect(() =>
        assertProductionSecrets({ ...base, JWT_SECRET: "dev-only-secret-change-me-min-32-bytes" }),
      ).toThrow(/Refusing to start/);
    });

    it("does not throw when the environment is sound", () => {
      expect(() => assertProductionSecrets(base)).not.toThrow();
    });
  });

  it("compares known values case-insensitively and ignores surrounding space", () => {
    expect(isPubliclyKnown("  DEMO1234 ")).toBe(true);
    expect(isPubliclyKnown("a-genuinely-random-value")).toBe(false);
  });
});
