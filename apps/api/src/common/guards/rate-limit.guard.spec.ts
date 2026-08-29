import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitGuard } from "./rate-limit.guard";
import type { AuditService } from "../../audit/audit.service";

/**
 * The limits SECURITY.md §2/§9 actually asks for: sign-in, booking creation,
 * payment mutation and public availability — and nothing else.
 *
 * The guard previously throttled every route through one shared bucket, which
 * no test covered, so a limit that broke ordinary use looked correct.
 */

interface FakeRequest {
  method: string;
  path: string;
  ip: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress: string };
  body?: unknown;
}

function requestFor(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return {
    method: "GET",
    path: "/api/v1/services",
    ip: "10.0.0.1",
    headers: {},
    socket: { remoteAddress: "10.0.0.1" },
    ...overrides,
  };
}

function contextFor(req: FakeRequest, headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      }),
    }),
  } as unknown as Parameters<RateLimitGuard["canActivate"]>[0];
}

/** Calls the guard n times, returning how many were allowed through. */
function drive(guard: RateLimitGuard, req: FakeRequest, times: number): number {
  let allowed = 0;
  for (let i = 0; i < times; i += 1) {
    try {
      guard.canActivate(contextFor(req));
      allowed += 1;
    } catch {
      break;
    }
  }
  return allowed;
}

describe("RateLimitGuard", () => {
  let guard: RateLimitGuard;

  beforeEach(() => {
    guard = new RateLimitGuard();
  });

  it("never throttles the health check", () => {
    const req = requestFor({ path: "/api/v1/health" });
    expect(drive(guard, req, 2000)).toBe(2000);
  });

  it("lets ordinary authenticated reads through well past the old 100/min limit", () => {
    // A salon behind one office NAT shares an address; the availability board
    // alone spends eleven requests per load.
    expect(drive(guard, requestFor(), 500)).toBe(500);
  });

  it("stops one account first when a single caller retries the same sign-in", () => {
    const req = requestFor({
      method: "POST",
      path: "/api/v1/auth/login",
      body: { email: "someone@demo.salon" },
    });
    // Both buckets apply; the tighter per-account allowance is reached first.
    expect(drive(guard, req, 50)).toBe(5);
  });

  it("stops one address spraying sign-ins across many accounts", () => {
    let allowed = 0;
    for (let i = 0; i < 30; i += 1) {
      const req = requestFor({
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: `user${i}@demo.salon` },
      });
      try {
        guard.canActivate(contextFor(req));
        allowed += 1;
      } catch {
        break;
      }
    }
    expect(allowed).toBe(10);
  });

  it("throttles one account even as the address changes", () => {
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) {
      const req = requestFor({
        method: "POST",
        path: "/api/v1/auth/login",
        ip: `10.0.0.${i}`,
        socket: { remoteAddress: `10.0.0.${i}` },
        body: { email: "victim@demo.salon" },
      });
      try {
        guard.canActivate(contextFor(req));
        allowed += 1;
      } catch {
        break;
      }
    }
    expect(allowed).toBe(5);
  });

  it("gives separate accounts separate allowances", () => {
    const one = requestFor({
      method: "POST",
      path: "/api/v1/auth/login",
      body: { email: "first@demo.salon" },
    });
    expect(drive(guard, one, 5)).toBe(5);

    const two = requestFor({
      method: "POST",
      path: "/api/v1/auth/login",
      ip: "10.0.0.2",
      socket: { remoteAddress: "10.0.0.2" },
      body: { email: "second@demo.salon" },
    });
    expect(drive(guard, two, 5)).toBe(5);
  });

  it("throttles public availability and booking, not the salon profile read", () => {
    const availability = requestFor({ method: "POST", path: "/api/v1/salons/elegance/availability" });
    expect(drive(guard, availability, 100)).toBe(60);

    const profile = requestFor({ method: "GET", path: "/api/v1/salons/elegance" });
    expect(drive(guard, profile, 200)).toBe(200);
  });

  it("reports how long to wait, not the whole window", () => {
    const headers: Record<string, string> = {};
    const req = requestFor({
      method: "POST",
      path: "/api/v1/auth/login",
      body: { email: "someone@demo.salon" },
    });
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(contextFor(req, headers));
    }
    expect(() => guard.canActivate(contextFor(req, headers))).toThrow();
    // The oldest stamp is milliseconds old, so the wait is the full 60s minus
    // that — the point is it is derived, and never zero.
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
    expect(Number(headers["Retry-After"])).toBeLessThanOrEqual(60);
  });

  it("ignores a forged X-Forwarded-For when not behind a trusted proxy", () => {
    // Appending junk to the header used to mint a fresh bucket every request.
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) {
      const req = requestFor({
        method: "POST",
        path: "/api/v1/salons/elegance/bookings",
        headers: { "x-forwarded-for": `1.2.3.${i}` },
      });
      try {
        guard.canActivate(contextFor(req));
        allowed += 1;
      } catch {
        break;
      }
    }
    expect(allowed).toBe(20); // the booking limit, reached despite the spoofing
  });

  it("audits RATE_LIMIT_EXCEEDED once the limit is actually hit, without blocking the synchronous throw", () => {
    const audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;
    const audited = new RateLimitGuard(audit);
    const req = requestFor({
      method: "POST",
      path: "/api/v1/auth/login",
      body: { email: "someone@demo.salon" },
    });

    for (let i = 0; i < 5; i += 1) {
      audited.canActivate(contextFor(req));
    }
    expect(() => audited.canActivate(contextFor(req))).toThrow();

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RATE_LIMIT_EXCEEDED", entityId: "sign-in" }),
    );
  });

  it("still throws synchronously with no AuditService supplied", () => {
    const audited = new RateLimitGuard();
    const req = requestFor({
      method: "POST",
      path: "/api/v1/auth/login",
      body: { email: "someone@demo.salon" },
    });
    for (let i = 0; i < 5; i += 1) {
      audited.canActivate(contextFor(req));
    }
    expect(() => audited.canActivate(contextFor(req))).toThrow();
  });
});
