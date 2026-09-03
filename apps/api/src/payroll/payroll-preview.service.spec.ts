import type { ObjectLiteral, Repository } from "typeorm";
import { IncentivePayoutStatus, PayComponentType } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPreviewService } from "./payroll-preview.service";
import type { BasePayService } from "./base-pay.service";
import type { BasePayPreviewView } from "./base-pay.types";
import type { IncentiveService, StaffEarnings } from "../incentive/incentive.service";
import type { IncentivePayout } from "../entities/incentive-payout.entity";
import type { PayComponentService } from "./pay-component.service";
import type { PayComponentView } from "./pay-component.types";

function mockRepo<T extends ObjectLiteral>() {
  return { findOne: vi.fn(async () => null as T | null) } as unknown as Repository<T>;
}

function basePayResult(overrides: Partial<BasePayPreviewView> = {}): BasePayPreviewView {
  return {
    staffId: "s1",
    staffName: "Nadia",
    from: "2026-09-01",
    to: "2026-09-30",
    earnedCents: 300_000,
    unpaidAbsenceDays: 0,
    unresolvedClosureDays: 0,
    daysWithoutEmployment: 0,
    days: [],
    ...overrides,
  };
}

describe("PayrollPreviewService", () => {
  let basePay: { preview: ReturnType<typeof vi.fn> };
  let incentives: { earningsFor: ReturnType<typeof vi.fn> };
  let payComponents: { list: ReturnType<typeof vi.fn> };
  let payouts: Repository<IncentivePayout>;
  let service: PayrollPreviewService;

  beforeEach(() => {
    basePay = { preview: vi.fn(async () => basePayResult()) };
    incentives = { earningsFor: vi.fn(async () => null) };
    payComponents = { list: vi.fn(async () => [] as PayComponentView[]) };
    payouts = mockRepo<IncentivePayout>();
    service = new PayrollPreviewService(
      basePay as unknown as BasePayService,
      incentives as unknown as IncentiveService,
      payComponents as unknown as PayComponentService,
      payouts,
    );
  });

  it("returns base pay alone when the tenant doesn't have Incentives enabled", async () => {
    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, false);
    expect(result.incentive).toBeNull();
    expect(result.totalCents).toBe(300_000);
    expect(incentives.earningsFor).not.toHaveBeenCalled();
  });

  it("uses a live estimate when no payout has been finalized for this exact period", async () => {
    incentives.earningsFor.mockResolvedValue({ breakdown: { totalCents: 25_000 } } as unknown as StaffEarnings);
    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, true);
    expect(result.incentive).toEqual({ source: "LIVE_ESTIMATE", totalCents: 25_000, payoutId: null });
    expect(result.totalCents).toBe(325_000);
  });

  it("prefers an already-finalized payout for the exact period over a live estimate", async () => {
    vi.mocked(payouts.findOne).mockResolvedValue({ id: "payout-1", totalCents: 40_000 } as IncentivePayout);
    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, true);
    expect(result.incentive).toEqual({ source: "FINALIZED_PAYOUT", totalCents: 40_000, payoutId: "payout-1" });
    expect(result.totalCents).toBe(340_000);
    expect(incentives.earningsFor).not.toHaveBeenCalled();
    expect(payouts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ staffId: "s1", periodStart: "2026-09-01", periodEnd: "2026-09-30" }),
      }),
    );
    // The lookup excludes voided payouts — a corrected/replaced payout must never be picked up here.
    const call = vi.mocked(payouts.findOne).mock.calls[0][0] as { where: { status: unknown } };
    expect(call.where.status).not.toBe(IncentivePayoutStatus.VOID);
  });

  it("leaves the incentive component null when Incentives is enabled but this staff member has no plan assigned", async () => {
    incentives.earningsFor.mockResolvedValue(null);
    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, true);
    expect(result.incentive).toBeNull();
    expect(result.totalCents).toBe(300_000);
  });

  it("adds active allowances to gross and separates deductions out, without touching the EPF base unless marked applicable", async () => {
    payComponents.list.mockResolvedValue([
      { id: "c1", type: PayComponentType.TRANSPORT, kind: "ALLOWANCE", amountCents: 5_000, epfApplicable: true, etfApplicable: false, active: true } as unknown as PayComponentView,
      { id: "c2", type: PayComponentType.MEAL, kind: "ALLOWANCE", amountCents: 3_000, epfApplicable: false, etfApplicable: false, active: true } as unknown as PayComponentView,
      { id: "c3", type: PayComponentType.LOAN_REPAYMENT, kind: "DEDUCTION", amountCents: 2_000, epfApplicable: false, etfApplicable: false, active: true } as unknown as PayComponentView,
    ]);

    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, false);

    expect(result.allowancesCents).toBe(8_000);
    expect(result.deductionsCents).toBe(2_000);
    expect(result.totalCents).toBe(300_000 + 8_000);
    expect(result.epfApplicableEarningsCents).toBe(300_000 + 5_000);
    expect(result.payComponents).toHaveLength(3);
  });

  it("excludes inactive components from every figure", async () => {
    payComponents.list.mockResolvedValue([
      { id: "c1", type: PayComponentType.TRANSPORT, kind: "ALLOWANCE", amountCents: 5_000, epfApplicable: false, etfApplicable: false, active: false } as unknown as PayComponentView,
    ]);
    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-30" }, false);
    expect(result.allowancesCents).toBe(0);
    expect(result.payComponents).toHaveLength(0);
  });
});
