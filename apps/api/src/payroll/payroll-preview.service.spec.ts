import type { ObjectLiteral, Repository } from "typeorm";
import { IncentivePayoutStatus } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPreviewService } from "./payroll-preview.service";
import type { BasePayService } from "./base-pay.service";
import type { BasePayPreviewView } from "./base-pay.types";
import type { IncentiveService, StaffEarnings } from "../incentive/incentive.service";
import type { IncentivePayout } from "../entities/incentive-payout.entity";

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
  let payouts: Repository<IncentivePayout>;
  let service: PayrollPreviewService;

  beforeEach(() => {
    basePay = { preview: vi.fn(async () => basePayResult()) };
    incentives = { earningsFor: vi.fn(async () => null) };
    payouts = mockRepo<IncentivePayout>();
    service = new PayrollPreviewService(basePay as unknown as BasePayService, incentives as unknown as IncentiveService, payouts);
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
});
