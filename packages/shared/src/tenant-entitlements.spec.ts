import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_ENTITLEMENTS,
  resolveLimits,
  resolveModules,
  resolveReportPanels,
  type TenantEntitlements,
} from "./tenant-entitlements";

function entitlements(overrides: Partial<TenantEntitlements> = {}): TenantEntitlements {
  return { ...DEFAULT_TENANT_ENTITLEMENTS, ...overrides };
}

describe("resolveModules", () => {
  it("PRO defaults every module on", () => {
    const modules = resolveModules(entitlements({ tier: "PRO" }));
    expect(modules).toEqual({ attendance: true, incentives: true, reports: true, auditLog: true, invoices: true, inventory: true, notifications: true, payroll: true });
  });

  it("LITE defaults every module off", () => {
    const modules = resolveModules(entitlements({ tier: "LITE" }));
    expect(modules).toEqual({ attendance: false, incentives: false, reports: false, auditLog: false, invoices: false, inventory: false, notifications: false, payroll: false });
  });

  it("an explicit override wins over the tier default in either direction", () => {
    const forLite = resolveModules(entitlements({ tier: "LITE", moduleOverrides: { reports: true } }));
    expect(forLite.reports).toBe(true);
    expect(forLite.attendance).toBe(false);

    const forPro = resolveModules(entitlements({ tier: "PRO", moduleOverrides: { invoices: false } }));
    expect(forPro.invoices).toBe(false);
    expect(forPro.reports).toBe(true);
  });
});

describe("resolveReportPanels", () => {
  it("LITE defaults every panel off, unless one is overridden on", () => {
    const panels = resolveReportPanels(
      entitlements({ tier: "LITE", reportPanelOverrides: { takings: true, lapsedCustomers: true } }),
    );
    expect(panels.takings).toBe(true);
    expect(panels.lapsedCustomers).toBe(true);
    expect(panels.staff).toBe(false);
    expect(panels.services).toBe(false);
  });

  it("PRO defaults every panel on", () => {
    const panels = resolveReportPanels(entitlements({ tier: "PRO" }));
    expect(Object.values(panels).every(Boolean)).toBe(true);
  });
});

describe("resolveLimits", () => {
  it("PRO is unlimited across every limit by default", () => {
    const limits = resolveLimits(entitlements({ tier: "PRO" }));
    expect(Object.values(limits).every((v) => v === null)).toBe(true);
  });

  it("LITE carries real numeric ceilings", () => {
    const limits = resolveLimits(entitlements({ tier: "LITE" }));
    expect(limits).toMatchObject({
      maxManagers: 0,
      maxReceptionists: 1,
      maxStaff: 5,
      maxServices: 20,
      maxIncentivePlans: 0,
      maxBookingsPerDay: 20,
      maxBookingWindowDays: 14,
      maxReminderOffsets: 1,
      maxDiscountCapPercent: 10,
    });
  });

  it("a per-tenant override raises (or lowers) one limit without touching the rest", () => {
    const limits = resolveLimits(entitlements({ tier: "LITE", limitOverrides: { maxStaff: 12 } }));
    expect(limits.maxStaff).toBe(12);
    expect(limits.maxServices).toBe(20);
  });

  it("an override can explicitly set a PRO tenant's limit rather than leaving it unlimited", () => {
    const limits = resolveLimits(entitlements({ tier: "PRO", limitOverrides: { maxBookingsPerDay: 40 } }));
    expect(limits.maxBookingsPerDay).toBe(40);
    expect(limits.maxStaff).toBeNull();
  });
});
