import { explainErrorLog, explainSecurityEvent } from "./explain-event";

describe("explainSecurityEvent", () => {
  it("names the affected person and salon for token reuse, and never mentions the raw action name", () => {
    const explanation = explainSecurityEvent({
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      actorName: "Nadeesha",
      tenantName: "Elegance Salon",
      recentCount: 1,
      metadata: {},
    });
    expect(explanation.title).not.toMatch(/REFRESH_TOKEN/);
    expect(explanation.plainLanguage).toContain("Nadeesha");
    expect(explanation.plainLanguage).toContain("Elegance Salon");
  });

  it("falls back to 'someone' when the actor is unknown, without crashing", () => {
    const explanation = explainSecurityEvent({
      action: "LOGIN_FAILED",
      actorName: null,
      tenantName: null,
      recentCount: 1,
      metadata: {},
    });
    expect(explanation.plainLanguage).toContain("someone");
  });

  it("escalates the login-failed narrative once it looks like brute force", () => {
    const isolated = explainSecurityEvent({
      action: "LOGIN_FAILED",
      actorName: "owner@elegance.salon",
      tenantName: "Elegance Salon",
      recentCount: 1,
      metadata: {},
    });
    const repeated = explainSecurityEvent({
      action: "LOGIN_FAILED",
      actorName: "owner@elegance.salon",
      tenantName: "Elegance Salon",
      recentCount: 8,
      metadata: {},
    });
    expect(isolated.title).toBe("Wrong password attempt");
    expect(repeated.title).toContain("break-in");
    expect(repeated.plainLanguage).toContain("8 times");
  });

  it("explains the specific rejection reason for a cross-tenant token", () => {
    const explanation = explainSecurityEvent({
      action: "CROSS_TENANT_TOKEN_REJECTED",
      actorName: "Kasun",
      tenantName: "Wellness360",
      recentCount: 1,
      metadata: { reason: "TENANT_SUSPENDED" },
    });
    expect(explanation.plainLanguage).toContain("suspended");
  });

  it("names the actual rule for a rate-limit event", () => {
    const explanation = explainSecurityEvent({
      action: "RATE_LIMIT_EXCEEDED",
      actorName: null,
      tenantName: null,
      recentCount: 1,
      metadata: { bucketKey: "sign-in:ip:10.0.0.1" },
    });
    expect(explanation.plainLanguage).toContain("sign-in");
  });

  it("names the person and the attempt count for an account lockout", () => {
    const explanation = explainSecurityEvent({
      action: "ACCOUNT_LOCKED",
      actorName: "receptionist@elegance.salon",
      tenantName: "Elegance Salon",
      recentCount: 1,
      metadata: { failedLoginAttempts: 5 },
    });
    expect(explanation.title).not.toMatch(/ACCOUNT_LOCKED/);
    expect(explanation.plainLanguage).toContain("receptionist@elegance.salon");
    expect(explanation.plainLanguage).toContain("5");
  });

  it("names who performed a password reset, and never suggests action is needed", () => {
    const explanation = explainSecurityEvent({
      action: "TEAM_MEMBER_PASSWORD_RESET",
      actorName: "receptionist@elegance.salon",
      tenantName: "Elegance Salon",
      recentCount: 1,
      metadata: { resetByRole: "MANAGER" },
    });
    expect(explanation.plainLanguage).toContain("manager");
    expect(explanation.recommendedAction).toMatch(/no action needed/i);
  });
});

describe("explainErrorLog", () => {
  it("escalates language with recurrence", () => {
    const once = explainErrorLog({ statusCode: 500, code: "INTERNAL_ERROR", path: "/bookings", tenantName: null, recentCount: 1 });
    const recurring = explainErrorLog({ statusCode: 500, code: "INTERNAL_ERROR", path: "/bookings", tenantName: null, recentCount: 12 });
    expect(once.title).toBe("Something went wrong once");
    expect(recurring.title).toContain("broken");
    expect(recurring.recommendedAction).toMatch(/urgent/i);
  });
});
