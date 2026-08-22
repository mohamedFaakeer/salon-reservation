import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ModuleGuard } from "./module.guard";

function fakeContext(tenantContext: { modules?: Record<string, boolean> } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({
      getRequest: () => ({ tenantContext }),
    }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(publicValue: boolean | undefined, moduleValue: string | undefined): Reflector {
  return {
    getAllAndOverride: vi.fn((key: string) => (key === "isPublic" ? publicValue : moduleValue)),
  } as unknown as Reflector;
}

describe("ModuleGuard", () => {
  it("passes a route with no @RequiresModule metadata", () => {
    const guard = new ModuleGuard(reflectorReturning(false, undefined));
    expect(guard.canActivate(fakeContext({ modules: { attendance: false } }))).toBe(true);
  });

  it("passes a public route regardless of entitlements", () => {
    const guard = new ModuleGuard(reflectorReturning(true, "attendance"));
    expect(guard.canActivate(fakeContext({ modules: { attendance: false } }))).toBe(true);
  });

  it("passes a platform request with no tenant context — entitlements describe a tenant's own plan", () => {
    const guard = new ModuleGuard(reflectorReturning(false, "attendance"));
    expect(guard.canActivate(fakeContext(undefined))).toBe(true);
  });

  it("passes when the tenant's resolved modules include the required one", () => {
    const guard = new ModuleGuard(reflectorReturning(false, "reports"));
    expect(guard.canActivate(fakeContext({ modules: { reports: true } }))).toBe(true);
  });

  it("refuses with MODULE_NOT_ENABLED when the tenant's plan doesn't include it", () => {
    const guard = new ModuleGuard(reflectorReturning(false, "incentives"));
    expect(() => guard.canActivate(fakeContext({ modules: { incentives: false } }))).toThrowError(
      expect.objectContaining({ code: "MODULE_NOT_ENABLED" }),
    );
  });
});
