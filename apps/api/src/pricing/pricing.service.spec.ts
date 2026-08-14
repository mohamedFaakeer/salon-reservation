import { AdvanceRule, DEFAULT_TENANT_SETTINGS, type TenantSettings } from "@salon/shared";
import { PricingService } from "./pricing.service";
import type { BookingSnapshotLine } from "../entities/slot-hold.entity";

function settings(overrides: Partial<TenantSettings>): TenantSettings {
  return { ...DEFAULT_TENANT_SETTINGS, ...overrides };
}

const lines: BookingSnapshotLine[] = [
  { serviceId: "svc-1", nameSnapshot: "Haircut", durationMinSnapshot: 30, priceCentsSnapshot: 300000 },
  { serviceId: "svc-2", nameSnapshot: "Wash", durationMinSnapshot: 15, priceCentsSnapshot: 100000 },
];

describe("PricingService", () => {
  const service = new PricingService();

  it("NO_ADVANCE: advance is 0, balance equals total", () => {
    const totals = service.computeTotals(lines, settings({ advanceRule: AdvanceRule.NO_ADVANCE }));
    expect(totals.subtotalCents).toBe(400000);
    expect(totals.totalCents).toBe(400000);
    expect(totals.advanceRequiredCents).toBe(0);
    expect(totals.balanceCents).toBe(400000);
  });

  it("FULL_PAYMENT: advance equals total, balance is 0", () => {
    const totals = service.computeTotals(lines, settings({ advanceRule: AdvanceRule.FULL_PAYMENT }));
    expect(totals.advanceRequiredCents).toBe(400000);
    expect(totals.balanceCents).toBe(0);
  });

  it("FIXED_AMOUNT: advance is the configured cents value", () => {
    const totals = service.computeTotals(
      lines,
      settings({ advanceRule: AdvanceRule.FIXED_AMOUNT, advanceValueCents: 100000 }),
    );
    expect(totals.advanceRequiredCents).toBe(100000);
    expect(totals.balanceCents).toBe(300000);
  });

  it("FIXED_AMOUNT exceeding the total is capped at the total, never negative balance", () => {
    const totals = service.computeTotals(
      lines,
      settings({ advanceRule: AdvanceRule.FIXED_AMOUNT, advanceValueCents: 999999999 }),
    );
    expect(totals.advanceRequiredCents).toBe(400000);
    expect(totals.balanceCents).toBe(0);
  });

  it("PERCENTAGE: advance is rounded to the nearest cent", () => {
    const totals = service.computeTotals(
      lines,
      settings({ advanceRule: AdvanceRule.PERCENTAGE, advancePercent: 50 }),
    );
    expect(totals.advanceRequiredCents).toBe(200000);
    expect(totals.balanceCents).toBe(200000);
  });

  it("PERCENTAGE at 100 equals the total", () => {
    const totals = service.computeTotals(
      lines,
      settings({ advanceRule: AdvanceRule.PERCENTAGE, advancePercent: 100 }),
    );
    expect(totals.advanceRequiredCents).toBe(400000);
    expect(totals.balanceCents).toBe(0);
  });

  it("PERCENTAGE with a null advancePercent behaves as 0", () => {
    const totals = service.computeTotals(
      lines,
      settings({ advanceRule: AdvanceRule.PERCENTAGE, advancePercent: null }),
    );
    expect(totals.advanceRequiredCents).toBe(0);
  });
});
