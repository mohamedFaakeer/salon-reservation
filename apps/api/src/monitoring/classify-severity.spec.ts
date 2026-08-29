import { classifyErrorLogSeverity, classifySecurityEventSeverity } from "./classify-severity";

describe("classifySecurityEventSeverity", () => {
  it("always rates token reuse CRITICAL, regardless of recentCount", () => {
    expect(classifySecurityEventSeverity("REFRESH_TOKEN_REUSE_DETECTED", 1)).toBe("CRITICAL");
    expect(classifySecurityEventSeverity("REFRESH_TOKEN_REUSE_DETECTED", 0)).toBe("CRITICAL");
  });

  it("always rates cross-tenant rejection HIGH", () => {
    expect(classifySecurityEventSeverity("CROSS_TENANT_TOKEN_REJECTED", 1)).toBe("HIGH");
  });

  it("escalates LOGIN_FAILED with repetition", () => {
    expect(classifySecurityEventSeverity("LOGIN_FAILED", 1)).toBe("LOW");
    expect(classifySecurityEventSeverity("LOGIN_FAILED", 2)).toBe("LOW");
    expect(classifySecurityEventSeverity("LOGIN_FAILED", 3)).toBe("MEDIUM");
    expect(classifySecurityEventSeverity("LOGIN_FAILED", 4)).toBe("MEDIUM");
    expect(classifySecurityEventSeverity("LOGIN_FAILED", 5)).toBe("HIGH");
    expect(classifySecurityEventSeverity("LOGIN_FAILED", 20)).toBe("HIGH");
  });

  it("escalates RATE_LIMIT_EXCEEDED only when sustained", () => {
    expect(classifySecurityEventSeverity("RATE_LIMIT_EXCEEDED", 1)).toBe("LOW");
    expect(classifySecurityEventSeverity("RATE_LIMIT_EXCEEDED", 5)).toBe("MEDIUM");
  });
});

describe("classifyErrorLogSeverity", () => {
  it("escalates with recurrence, independent of status code once past 5xx", () => {
    expect(classifyErrorLogSeverity(500, 1)).toBe("MEDIUM");
    expect(classifyErrorLogSeverity(500, 3)).toBe("HIGH");
    expect(classifyErrorLogSeverity(500, 10)).toBe("CRITICAL");
  });

  it("rates a non-5xx status LOW when it isn't recurring", () => {
    expect(classifyErrorLogSeverity(404, 1)).toBe("LOW");
  });
});
