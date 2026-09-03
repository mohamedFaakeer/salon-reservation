import type { ObjectLiteral, Repository } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatutoryPreviewService } from "./statutory-preview.service";
import type { Tenant } from "../entities/tenant.entity";
import type { PayrollPreviewService } from "./payroll-preview.service";
import type { PayrollPreviewView } from "./payroll-preview.types";
import type { StatutoryRuleSetService } from "./statutory-rule-set.service";
import type { StatutoryRuleSetView } from "./statutory-rule-set.types";

function mockRepo<T extends ObjectLiteral>() {
  return { findOne: vi.fn(async () => null as T | null) } as unknown as Repository<T>;
}

function payrollPreview(overrides: Partial<PayrollPreviewView> = {}): PayrollPreviewView {
  return {
    staffId: "s1",
    staffName: "Nadia",
    from: "2026-09-01",
    to: "2026-09-30",
    basePay: {
      staffId: "s1",
      staffName: "Nadia",
      from: "2026-09-01",
      to: "2026-09-30",
      earnedCents: 300_000_00,
      unpaidAbsenceDays: 0,
      unresolvedClosureDays: 0,
      daysWithoutEmployment: 0,
      days: [],
    },
    incentive: null,
    totalCents: 300_000_00,
    ...overrides,
  };
}

function ruleSet(overrides: Partial<StatutoryRuleSetView> = {}): StatutoryRuleSetView {
  return {
    id: "rule-1",
    epfEmployeePercent: 8,
    epfEmployerPercent: 12,
    etfEmployerPercent: 3,
    apitMonthlyFreeThresholdCents: 150_000_00,
    apitBands: [{ uptoCents: null, ratePercent: 6 }],
    verified: false,
    sourceNote: "Test fixture",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    createdByName: "Platform Admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("StatutoryPreviewService", () => {
  let tenants: Repository<Tenant>;
  let payroll: { preview: ReturnType<typeof vi.fn> };
  let ruleSets: { current: ReturnType<typeof vi.fn> };
  let service: StatutoryPreviewService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    payroll = { preview: vi.fn(async () => payrollPreview()) };
    ruleSets = { current: vi.fn(async () => ruleSet()) };
    service = new StatutoryPreviewService(tenants, payroll as unknown as PayrollPreviewService, ruleSets as unknown as StatutoryRuleSetService);
  });

  it("refuses when the tenant hasn't been enabled for statutory calculations", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: false } as Tenant);
    await expect(service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, false)).rejects.toMatchObject({
      code: "STATUTORY_PAYROLL_NOT_ENABLED",
    });
  });

  it("refuses a period that isn't exactly one full calendar month", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: true } as Tenant);
    await expect(service.preview("tenant-1", { staffId: "s1", from: "2026-09-05", to: "2026-09-30" }, false)).rejects.toMatchObject({
      code: "INVALID_STATUTORY_PERIOD",
    });
    await expect(service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-29" }, false)).rejects.toMatchObject({
      code: "INVALID_STATUTORY_PERIOD",
    });
  });

  it("refuses when no statutory rule set has ever been published", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: true } as Tenant);
    ruleSets.current.mockResolvedValue(null);
    await expect(service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, false)).rejects.toMatchObject({
      code: "NO_STATUTORY_RULE_SET",
    });
  });

  it("computes EPF/ETF/APIT from the gross figure and surfaces the rule set's verified status", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: true } as Tenant);
    payroll.preview.mockResolvedValue(payrollPreview({ totalCents: 300_000_00 }));

    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, false);

    expect(result.grossCents).toBe(300_000_00);
    expect(result.epfEmployeeCents).toBe(Math.round(300_000_00 * 0.08));
    expect(result.epfEmployerCents).toBe(Math.round(300_000_00 * 0.12));
    expect(result.etfEmployerCents).toBe(Math.round(300_000_00 * 0.03));
    // Taxable = 300,000 - 150,000 = 150,000, all at 6% (single open-ended band in this fixture).
    expect(result.apitCents).toBe(Math.round(150_000_00 * 0.06));
    expect(result.netCents).toBe(result.grossCents - result.epfEmployeeCents - result.apitCents);
    expect(result.verified).toBe(false);
    expect(result.ruleSetId).toBe("rule-1");
  });
});
