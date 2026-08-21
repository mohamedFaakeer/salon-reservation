import { AdvanceRule, DEFAULT_TENANT_SETTINGS, type TenantSettings } from "@salon/shared";
import { PricingService } from "./pricing.service";
import type { BookingSnapshotLine } from "../entities/slot-hold.entity";

function settings(overrides: Partial<TenantSettings>): TenantSettings {
  return { ...DEFAULT_TENANT_SETTINGS, ...overrides };
}

const lines: BookingSnapshotLine[] = [
  {
    serviceId: "svc-1",
    nameSnapshot: "Haircut",
    durationMinSnapshot: 30,
    priceCentsSnapshot: 300000,
    discountCentsSnapshot: 0,
    discountLabelSnapshot: null,
  },
  {
    serviceId: "svc-2",
    nameSnapshot: "Wash",
    durationMinSnapshot: 15,
    priceCentsSnapshot: 100000,
    discountCentsSnapshot: 0,
    discountLabelSnapshot: null,
  },
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

  describe("discounts", () => {
    const discounted: BookingSnapshotLine[] = [
      {
        serviceId: "svc-1",
        nameSnapshot: "Colour",
        durationMinSnapshot: 90,
        priceCentsSnapshot: 500000,
        discountCentsSnapshot: 100000,
        discountLabelSnapshot: "Tuesday 20% off",
      },
      {
        serviceId: "svc-2",
        nameSnapshot: "Wash",
        durationMinSnapshot: 15,
        priceCentsSnapshot: 100000,
        discountCentsSnapshot: 0,
        discountLabelSnapshot: null,
      },
    ];

    it("keeps the subtotal at list price and reports the discount beside it", () => {
      const totals = service.computeTotals(discounted, settings({ advanceRule: AdvanceRule.NO_ADVANCE }));

      // Both numbers are needed on an invoice: what it would have cost, and
      // what came off. A netted subtotal loses the second.
      expect(totals.subtotalCents).toBe(600000);
      expect(totals.discountCents).toBe(100000);
      expect(totals.totalCents).toBe(500000);
    });

    it("charges the advance on the discounted total, not the list price", () => {
      const totals = service.computeTotals(
        discounted,
        settings({ advanceRule: AdvanceRule.PERCENTAGE, advancePercent: 50 }),
      );

      // 50% of 500,000, not of 600,000 — over-collecting would owe a refund.
      expect(totals.advanceRequiredCents).toBe(250000);
      expect(totals.balanceCents).toBe(250000);
    });

    it("never produces a negative total", () => {
      const freebie: BookingSnapshotLine[] = [
        {
          serviceId: "svc-1",
          nameSnapshot: "Freebie",
          durationMinSnapshot: 30,
          priceCentsSnapshot: 100000,
          discountCentsSnapshot: 100000,
          discountLabelSnapshot: "On the house",
        },
      ];
      const totals = service.computeTotals(freebie, settings({ advanceRule: AdvanceRule.NO_ADVANCE }));

      expect(totals.totalCents).toBe(0);
      expect(totals.balanceCents).toBe(0);
    });

    it("treats a line with no discount field as undiscounted", () => {
      // Rows written before the column existed read back as undefined.
      const totals = service.computeTotals(
        [{ priceCentsSnapshot: 250000 }],
        settings({ advanceRule: AdvanceRule.NO_ADVANCE }),
      );

      expect(totals.discountCents).toBe(0);
      expect(totals.totalCents).toBe(250000);
    });
  });
});
