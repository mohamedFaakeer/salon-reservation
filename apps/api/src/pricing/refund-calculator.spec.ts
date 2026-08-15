import type { CancellationPolicy } from "@salon/shared";
import { RefundCalculator } from "./refund-calculator";

const POLICY: CancellationPolicy = {
  selfServiceCutoffHours: 2,
  refundPercentBeforeCutoff: 100,
  refundPercentAfterCutoff: 0,
  noShowRefundPercent: 0,
};

describe("RefundCalculator", () => {
  const calculator = new RefundCalculator();
  const startTime = new Date("2026-08-20T10:00:00.000Z");

  it("full refund when cancelled well before the cutoff", () => {
    const result = calculator.computeRefund({
      startTime,
      now: new Date("2026-08-20T05:00:00.000Z"), // 5h before start
      isSelfService: true,
      policy: POLICY,
      alreadyPaidCents: 10000,
      isNoShow: false,
    });
    expect(result).toEqual({ refundPercent: 100, refundCents: 10000 });
  });

  it("no refund when cancelled inside the cutoff window", () => {
    const result = calculator.computeRefund({
      startTime,
      now: new Date("2026-08-20T09:00:00.000Z"), // 1h before start
      isSelfService: true,
      policy: POLICY,
      alreadyPaidCents: 10000,
      isNoShow: false,
    });
    expect(result).toEqual({ refundPercent: 0, refundCents: 0 });
  });

  it("exactly at the cutoff boundary counts as inside the window (after-cutoff rate)", () => {
    const result = calculator.computeRefund({
      startTime,
      now: new Date("2026-08-20T08:00:00.000Z"), // exactly 2h before start
      isSelfService: true,
      policy: POLICY,
      alreadyPaidCents: 10000,
      isNoShow: false,
    });
    expect(result.refundPercent).toBe(0);
  });

  it("no-show uses noShowRefundPercent regardless of timing", () => {
    const result = calculator.computeRefund({
      startTime,
      now: new Date("2026-08-20T05:00:00.000Z"),
      isSelfService: false,
      policy: POLICY,
      alreadyPaidCents: 10000,
      isNoShow: true,
    });
    expect(result).toEqual({ refundPercent: 0, refundCents: 0 });
  });

  it("staff-initiated cancel uses the same tiers as self-service (isSelfService only gates eligibility, not the rate)", () => {
    const result = calculator.computeRefund({
      startTime,
      now: new Date("2026-08-20T09:30:00.000Z"), // 30 min before start
      isSelfService: false,
      policy: POLICY,
      alreadyPaidCents: 5000,
      isNoShow: false,
    });
    expect(result).toEqual({ refundPercent: 0, refundCents: 0 });
  });

  it("a partial refund percent rounds to the nearest cent and never exceeds what was paid", () => {
    const result = calculator.computeRefund({
      startTime,
      now: new Date("2026-08-20T05:00:00.000Z"),
      isSelfService: true,
      policy: { ...POLICY, refundPercentBeforeCutoff: 50 },
      alreadyPaidCents: 333,
      isNoShow: false,
    });
    expect(result.refundCents).toBe(167); // round(333 * 0.5) = 167, still <= 333
    expect(result.refundCents).toBeLessThanOrEqual(333);
  });
});
