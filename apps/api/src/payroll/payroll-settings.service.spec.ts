import type { ObjectLiteral, Repository } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollSettingsService } from "./payroll-settings.service";
import type { Tenant } from "../entities/tenant.entity";
import type { PayCalendarService } from "./pay-calendar.service";
import type { StatutoryRuleSetService } from "./statutory-rule-set.service";
import type { StatutoryRuleSetView } from "./statutory-rule-set.types";

function mockRepo<T extends ObjectLiteral>() {
  return { findOne: vi.fn(async () => null as T | null) } as unknown as Repository<T>;
}

describe("PayrollSettingsService", () => {
  let tenants: Repository<Tenant>;
  let payCalendar: { resolve: ReturnType<typeof vi.fn> };
  let ruleSets: { current: ReturnType<typeof vi.fn> };
  let service: PayrollSettingsService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    payCalendar = { resolve: vi.fn(async () => ({ monthlyAnchorDay: 1 })) };
    ruleSets = { current: vi.fn(async () => null as StatutoryRuleSetView | null) };
    service = new PayrollSettingsService(tenants, payCalendar as unknown as PayCalendarService, ruleSets as unknown as StatutoryRuleSetService);
  });

  it("never fetches the rate table when the tenant isn't statutory-enabled", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: false } as Tenant);
    const result = await service.get("tenant-1");
    expect(result.statutoryPayrollEnabled).toBe(false);
    expect(result.statutoryRuleSet).toBeNull();
    expect(ruleSets.current).not.toHaveBeenCalled();
  });

  it("includes the current rate table's summary when the tenant is enabled", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: true } as Tenant);
    ruleSets.current.mockResolvedValue({
      epfEmployeePercent: 8,
      epfEmployerPercent: 12,
      etfEmployerPercent: 3,
      apitMonthlyFreeThresholdCents: 150_000_00,
      verified: true,
    } as StatutoryRuleSetView);

    const result = await service.get("tenant-1");

    expect(result.statutoryPayrollEnabled).toBe(true);
    expect(result.statutoryRuleSet).toEqual({
      epfEmployeePercent: 8,
      epfEmployerPercent: 12,
      etfEmployerPercent: 3,
      apitMonthlyFreeThresholdCents: 150_000_00,
      verified: true,
    });
  });

  it("returns the pay calendar regardless of statutory status", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: false } as Tenant);
    payCalendar.resolve.mockResolvedValue({ monthlyAnchorDay: 21 });
    const result = await service.get("tenant-1");
    expect(result.payCalendar).toEqual({ monthlyAnchorDay: 21 });
  });
});
