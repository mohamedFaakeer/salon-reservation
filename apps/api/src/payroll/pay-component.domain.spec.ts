import { PayComponentKind, PayComponentType } from "@salon/shared";
import { describe, expect, it } from "vitest";
import { computeEarningsBases, type PayComponentLine } from "./pay-component.domain";

function allowance(overrides: Partial<PayComponentLine> = {}): PayComponentLine {
  return {
    type: PayComponentType.TRANSPORT,
    kind: PayComponentKind.ALLOWANCE,
    amountCents: 5_000_00,
    epfApplicable: false,
    etfApplicable: false,
    ...overrides,
  };
}

function deduction(overrides: Partial<PayComponentLine> = {}): PayComponentLine {
  return {
    type: PayComponentType.LOAN_REPAYMENT,
    kind: PayComponentKind.DEDUCTION,
    amountCents: 3_000_00,
    epfApplicable: false,
    etfApplicable: false,
    ...overrides,
  };
}

describe("computeEarningsBases", () => {
  it("with no components, gross is just base pay plus incentive, and both statutory bases are just base pay", () => {
    const result = computeEarningsBases(300_000_00, 25_000_00, []);
    expect(result).toEqual({
      allowancesCents: 0,
      deductionsCents: 0,
      grossCents: 325_000_00,
      epfApplicableEarningsCents: 300_000_00,
      etfApplicableEarningsCents: 300_000_00,
    });
  });

  it("adds every allowance to gross, regardless of EPF/ETF applicability", () => {
    const result = computeEarningsBases(300_000_00, 0, [
      allowance({ amountCents: 5_000_00 }),
      allowance({ type: PayComponentType.MEAL, amountCents: 3_000_00 }),
    ]);
    expect(result.allowancesCents).toBe(8_000_00);
    expect(result.grossCents).toBe(308_000_00);
  });

  it("only counts an allowance toward the EPF base when it's marked epfApplicable", () => {
    const result = computeEarningsBases(300_000_00, 0, [
      allowance({ amountCents: 5_000_00, epfApplicable: true }),
      allowance({ type: PayComponentType.MEAL, amountCents: 3_000_00, epfApplicable: false }),
    ]);
    expect(result.epfApplicableEarningsCents).toBe(305_000_00);
  });

  it("EPF and ETF applicability are independent per allowance", () => {
    const result = computeEarningsBases(300_000_00, 0, [
      allowance({ amountCents: 5_000_00, epfApplicable: true, etfApplicable: false }),
      allowance({ type: PayComponentType.MEAL, amountCents: 3_000_00, epfApplicable: false, etfApplicable: true }),
    ]);
    expect(result.epfApplicableEarningsCents).toBe(305_000_00);
    expect(result.etfApplicableEarningsCents).toBe(303_000_00);
  });

  it("never lets incentive/commission into the EPF or ETF base, even if it dwarfs base pay", () => {
    const result = computeEarningsBases(300_000_00, 500_000_00, []);
    expect(result.epfApplicableEarningsCents).toBe(300_000_00);
    expect(result.etfApplicableEarningsCents).toBe(300_000_00);
    expect(result.grossCents).toBe(800_000_00);
  });

  it("sums deductions separately, without touching gross or the statutory bases", () => {
    const result = computeEarningsBases(300_000_00, 0, [deduction({ amountCents: 10_000_00 }), deduction({ type: PayComponentType.SALARY_ADVANCE_RECOVERY, amountCents: 2_000_00 })]);
    expect(result.deductionsCents).toBe(12_000_00);
    expect(result.grossCents).toBe(300_000_00);
    expect(result.epfApplicableEarningsCents).toBe(300_000_00);
  });
});
