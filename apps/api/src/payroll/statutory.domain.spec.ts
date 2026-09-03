import { describe, expect, it } from "vitest";
import { computeApitForMonth, computeEpfEtf } from "./statutory.domain";

describe("computeEpfEtf", () => {
  it("computes each figure as an independent flat percentage of its own base", () => {
    const result = computeEpfEtf(
      { epfApplicableEarningsCents: 100_000_00, etfApplicableEarningsCents: 100_000_00 },
      { epfEmployeePercent: 8, epfEmployerPercent: 12, etfEmployerPercent: 3 },
    );
    expect(result).toEqual({ epfEmployeeCents: 8_000_00, epfEmployerCents: 12_000_00, etfEmployerCents: 3_000_00 });
  });

  it("rounds to the nearest cent", () => {
    const result = computeEpfEtf(
      { epfApplicableEarningsCents: 333, etfApplicableEarningsCents: 333 },
      { epfEmployeePercent: 8, epfEmployerPercent: 12, etfEmployerPercent: 3 },
    );
    // 333 * 0.08 = 26.64 -> 27; * 0.12 = 39.96 -> 40; * 0.03 = 9.99 -> 10
    expect(result).toEqual({ epfEmployeeCents: 27, epfEmployerCents: 40, etfEmployerCents: 10 });
  });

  it("zero base earns zero everything", () => {
    expect(
      computeEpfEtf(
        { epfApplicableEarningsCents: 0, etfApplicableEarningsCents: 0 },
        { epfEmployeePercent: 8, epfEmployerPercent: 12, etfEmployerPercent: 3 },
      ),
    ).toEqual({
      epfEmployeeCents: 0,
      epfEmployerCents: 0,
      etfEmployerCents: 0,
    });
  });

  it("computes EPF and ETF from independent bases when they differ", () => {
    const result = computeEpfEtf(
      { epfApplicableEarningsCents: 300_000_00, etfApplicableEarningsCents: 305_000_00 },
      { epfEmployeePercent: 8, epfEmployerPercent: 12, etfEmployerPercent: 3 },
    );
    expect(result.epfEmployeeCents).toBe(Math.round(300_000_00 * 0.08));
    expect(result.etfEmployerCents).toBe(Math.round(305_000_00 * 0.03));
  });
});

describe("computeApitForMonth", () => {
  // A simplified, illustrative band table for testing the mechanism itself
  // (progressive allocation, free threshold, "and above" band) — NOT
  // asserted anywhere to be the real IRD table.
  const bands = [
    { uptoCents: 100_000_00, ratePercent: 6 },
    { uptoCents: 150_000_00, ratePercent: 18 },
    { uptoCents: null, ratePercent: 24 },
  ];
  const freeThreshold = 150_000_00;

  it("income at or below the free threshold owes nothing", () => {
    expect(computeApitForMonth(150_000_00, freeThreshold, bands)).toBe(0);
    expect(computeApitForMonth(50_000_00, freeThreshold, bands)).toBe(0);
  });

  it("taxes only the amount inside the first band once the threshold is cleared", () => {
    // 200,000 gross - 150,000 threshold = 50,000 taxable, entirely inside the 6% band.
    expect(computeApitForMonth(200_000_00, freeThreshold, bands)).toBe(Math.round(50_000_00 * 0.06));
  });

  it("splits taxable income across bands progressively, not at one flat rate", () => {
    // Taxable = 400,000 - 150,000 = 250,000: 100,000 @ 6%, 50,000 @ 18%, 100,000 @ 24%.
    const expected = Math.round(100_000_00 * 0.06) + Math.round(50_000_00 * 0.18) + Math.round(100_000_00 * 0.24);
    expect(computeApitForMonth(400_000_00, freeThreshold, bands)).toBe(expected);
  });

  it("the last (uncapped) band absorbs everything above the previous band's ceiling", () => {
    const taxable = 1_000_000_00 - freeThreshold;
    const expected = Math.round(100_000_00 * 0.06) + Math.round(50_000_00 * 0.18) + Math.round((taxable - 150_000_00) * 0.24);
    expect(computeApitForMonth(1_000_000_00, freeThreshold, bands)).toBe(expected);
  });
});
