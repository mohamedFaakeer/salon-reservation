import { describe, expect, it } from "vitest";
import { allocateReceivedByLine, computeIncentive, type EarningLine, type PlanComponents } from "./incentive.domain";

function plan(overrides: Partial<PlanComponents> = {}): PlanComponents {
  return {
    baseCommissionPercent: null,
    perJobAmountCents: null,
    monthlyTargetCents: null,
    tierBonusPercent: null,
    serviceRates: new Map(),
    ...overrides,
  };
}

function line(overrides: Partial<EarningLine> = {}): EarningLine {
  return { serviceId: "svc-1", receivedCents: 100_00, jobCompleted: true, ...overrides };
}

describe("computeIncentive", () => {
  it("pays nothing when no lines were earned", () => {
    const result = computeIncentive(plan({ baseCommissionPercent: 20 }), []);
    expect(result).toEqual({
      revenueCents: 0,
      commissionCents: 0,
      jobsCompleted: 0,
      perJobCents: 0,
      tierBonusCents: 0,
      totalCents: 0,
    });
  });

  describe("base commission", () => {
    it("applies the flat percent across every line with no override", () => {
      const result = computeIncentive(
        plan({ baseCommissionPercent: 15 }),
        [line({ receivedCents: 10_000 }), line({ receivedCents: 20_000 })],
      );
      expect(result.revenueCents).toBe(30_000);
      expect(result.commissionCents).toBe(1_500 + 3_000);
      expect(result.totalCents).toBe(result.commissionCents);
    });

    it("earns nothing extra from a line that received no money", () => {
      const result = computeIncentive(
        plan({ baseCommissionPercent: 50 }),
        [line({ receivedCents: 0 })],
      );
      expect(result.commissionCents).toBe(0);
    });
  });

  describe("per-service overrides", () => {
    it("uses a named service's own rate instead of the base for that line only", () => {
      const rates = new Map([["colour", 30]]);
      const result = computeIncentive(
        plan({ baseCommissionPercent: 10, serviceRates: rates }),
        [
          line({ serviceId: "cut", receivedCents: 10_000 }),
          line({ serviceId: "colour", receivedCents: 10_000 }),
        ],
      );
      // cut: 10% of 10000 = 1000. colour: 30% of 10000 = 3000.
      expect(result.commissionCents).toBe(1_000 + 3_000);
    });

    it("still earns from a plan with only per-service rates and no base commission", () => {
      const result = computeIncentive(
        plan({ serviceRates: new Map([["colour", 30]]) }),
        [line({ serviceId: "colour", receivedCents: 10_000 })],
      );
      expect(result.commissionCents).toBe(3_000);
    });

    it("a line for a service with no override and no base commission earns zero, not the last-seen rate", () => {
      const result = computeIncentive(
        plan({ serviceRates: new Map([["colour", 30]]) }),
        [line({ serviceId: "cut", receivedCents: 10_000 })],
      );
      expect(result.commissionCents).toBe(0);
    });
  });

  describe("flat per-job", () => {
    it("pays a fixed amount per completed line, regardless of what it earned in commission", () => {
      const result = computeIncentive(
        plan({ perJobAmountCents: 500 }),
        [line({ jobCompleted: true }), line({ jobCompleted: true }), line({ jobCompleted: true })],
      );
      expect(result.jobsCompleted).toBe(3);
      expect(result.perJobCents).toBe(1_500);
    });

    it("does not count a line whose appointment never reached completed", () => {
      const result = computeIncentive(
        plan({ perJobAmountCents: 500 }),
        [line({ jobCompleted: true }), line({ jobCompleted: false })],
      );
      expect(result.jobsCompleted).toBe(1);
      expect(result.perJobCents).toBe(500);
    });
  });

  describe("monthly target tier bonus", () => {
    it("pays nothing below the target", () => {
      const result = computeIncentive(
        plan({ monthlyTargetCents: 100_000, tierBonusPercent: 20 }),
        [line({ receivedCents: 50_000 })],
      );
      expect(result.tierBonusCents).toBe(0);
    });

    it("pays the bonus rate only on the amount past the target, not the whole total", () => {
      const result = computeIncentive(
        plan({ monthlyTargetCents: 100_000, tierBonusPercent: 20 }),
        [line({ receivedCents: 150_000 })],
      );
      // 50,000 past target, 20% of that = 10,000 — not 20% of 150,000.
      expect(result.tierBonusCents).toBe(10_000);
    });

    it("does nothing when only one of target/bonus is set — the DTO/DB pairing rule, mirrored defensively", () => {
      const result = computeIncentive(
        plan({ monthlyTargetCents: 100_000, tierBonusPercent: null }),
        [line({ receivedCents: 150_000 })],
      );
      expect(result.tierBonusCents).toBe(0);
    });
  });

  it("composes all three components in one total", () => {
    const result = computeIncentive(
      plan({ baseCommissionPercent: 10, perJobAmountCents: 200, monthlyTargetCents: 5_000, tierBonusPercent: 50 }),
      [line({ receivedCents: 10_000, jobCompleted: true })],
    );
    // commission: 1000. perJob: 200. tier: 50% of (10000-5000) = 2500.
    expect(result.commissionCents).toBe(1_000);
    expect(result.perJobCents).toBe(200);
    expect(result.tierBonusCents).toBe(2_500);
    expect(result.totalCents).toBe(3_700);
  });
});

describe("allocateReceivedByLine", () => {
  it("splits a full payment proportionally by what each line was charged", () => {
    const shares = allocateReceivedByLine(10_000, [{ chargedCents: 3_000 }, { chargedCents: 7_000 }]);
    expect(shares).toEqual([3_000, 7_000]);
  });

  it("splits a partial payment the same proportion, not first-line-first", () => {
    const shares = allocateReceivedByLine(5_000, [{ chargedCents: 3_000 }, { chargedCents: 7_000 }]);
    expect(shares).toEqual([1_500, 3_500]);
  });

  it("gives every line zero when nothing has been received", () => {
    expect(allocateReceivedByLine(0, [{ chargedCents: 5_000 }])).toEqual([0]);
  });

  it("gives every line zero rather than dividing by zero when the appointment was fully discounted", () => {
    expect(allocateReceivedByLine(0, [{ chargedCents: 0 }, { chargedCents: 0 }])).toEqual([0, 0]);
  });
});
