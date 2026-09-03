import { UserRole } from "@salon/shared";
import { describe, expect, it } from "vitest";
import { Permission } from "./permission.enum";
import { ROLE_PERMISSIONS } from "./role-permissions";

/**
 * Payroll module hardening pass (DECISIONS.md §71) — this codebase had no
 * automated test at all pinning down which roles hold `MANAGE_PAYROLL`,
 * relying entirely on `role-permissions.ts` being read correctly by hand.
 * A salary/statutory feature is exactly the kind of surface where "we
 * believe RECEPTIONIST can't see this" needs to be an assertion, not a
 * belief — this is the regression guard for that.
 */
describe("MANAGE_PAYROLL role assignment", () => {
  it("OWNER and MANAGER hold it — running payroll is an owner/manager decision", () => {
    expect(ROLE_PERMISSIONS[UserRole.OWNER]).toContain(Permission.MANAGE_PAYROLL);
    expect(ROLE_PERMISSIONS[UserRole.MANAGER]).toContain(Permission.MANAGE_PAYROLL);
  });

  it("RECEPTIONIST does not hold it — the front desk has no business seeing salary or statutory data", () => {
    expect(ROLE_PERMISSIONS[UserRole.RECEPTIONIST]).not.toContain(Permission.MANAGE_PAYROLL);
  });

  it("STAFF does not hold it — a stylist has no payroll-configuration access, only (via a separate permission) their own incentive figure", () => {
    expect(ROLE_PERMISSIONS[UserRole.STAFF]).not.toContain(Permission.MANAGE_PAYROLL);
  });

  it("SUPER_ADMIN does not hold it directly — platform staff reach tenant data only through explicit, audited super-admin routes, never a tenant permission", () => {
    expect(ROLE_PERMISSIONS[UserRole.SUPER_ADMIN]).not.toContain(Permission.MANAGE_PAYROLL);
  });
});
