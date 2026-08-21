import type { ObjectLiteral, Repository } from "typeorm";
import { IncentivePayoutStatus } from "@salon/shared";
import { IncentivePayoutService } from "./incentive-payout.service";
import type { IncentivePayout } from "../entities/incentive-payout.entity";
import type { Staff } from "../entities/staff.entity";
import type { IncentiveService, StaffEarnings } from "./incentive.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function reloaded(id = "generated-id"): IncentivePayout {
  return {
    id,
    staff: { name: "Nadia" },
    finalisedByUser: { name: "Owner" },
    snapshot: { plan: { name: "Commission" }, lines: [] },
    createdAt: new Date("2026-08-22T00:00:00Z"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function earnings(overrides: Partial<StaffEarnings["breakdown"]> = {}): StaffEarnings {
  return {
    staff: { id: "s1", name: "Nadia" } as Staff,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plan: { id: "plan-1", name: "Commission", baseCommissionPercent: 10, serviceRates: [] } as any,
    breakdown: {
      revenueCents: 10_000,
      commissionCents: 1_000,
      jobsCompleted: 2,
      perJobCents: 0,
      tierBonusCents: 0,
      totalCents: 1_000,
      ...overrides,
    },
    lines: [],
  };
}

describe("IncentivePayoutService", () => {
  let payouts: Repository<IncentivePayout>;
  let staff: Repository<Staff>;
  let incentives: { earningsFor: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn>; manager: unknown };
  let service: IncentivePayoutService;

  beforeEach(() => {
    payouts = mockRepo<IncentivePayout>();
    staff = mockRepo<Staff>();
    incentives = { earningsFor: vi.fn(async () => earnings()) };
    audit = { record: vi.fn(async () => undefined) };
    dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
        const manager = { getRepository: () => payouts };
        return cb(manager);
      }),
      manager: {},
    };
    vi.mocked(staff.findOne).mockResolvedValue({ id: "s1", name: "Nadia" } as Staff);
    service = new IncentivePayoutService(
      payouts,
      staff,
      incentives as unknown as IncentiveService,
      audit as never,
      dataSource as never,
    );
  });

  describe("run", () => {
    it("rejects an end date before the start date", async () => {
      await expect(
        service.run("tenant-1", { staffId: "s1", periodStart: "2026-08-31", periodEnd: "2026-08-01" }, "user-1"),
      ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
    });

    it("refuses a staff member with no incentive plan assigned", async () => {
      incentives.earningsFor.mockResolvedValueOnce(null);

      await expect(
        service.run("tenant-1", { staffId: "s1", periodStart: "2026-08-01", periodEnd: "2026-08-31" }, "user-1"),
      ).rejects.toMatchObject({ code: "NO_INCENTIVE_PLAN" });
    });

    it("finalises a new payout when none exists yet for the period", async () => {
      vi.mocked(payouts.findOne)
        .mockResolvedValueOnce(null) // the live lookup
        .mockResolvedValueOnce(reloaded()); // the reload

      await service.run("tenant-1", { staffId: "s1", periodStart: "2026-08-01", periodEnd: "2026-08-31" }, "user-1");

      const created = vi.mocked(payouts.create).mock.calls[0][0] as Partial<IncentivePayout>;
      expect(created.status).toBe(IncentivePayoutStatus.FINALISED);
      expect(created.totalCents).toBe(1_000);
      expect(created.supersedesPayoutId).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "INCENTIVE_PAYOUT_FINALISED" }),
        expect.anything(),
      );
    });

    it("returns the existing payout unchanged when the figure hasn't moved", async () => {
      const existing = {
        id: "payout-1",
        status: IncentivePayoutStatus.FINALISED,
        revenueCents: 10_000,
        commissionCents: 1_000,
        jobsCompleted: 2,
        perJobCents: 0,
        tierBonusCents: 0,
        totalCents: 1_000,
      } as IncentivePayout;
      vi.mocked(payouts.findOne)
        .mockResolvedValueOnce(existing) // the live lookup inside the transaction
        .mockResolvedValueOnce(reloaded(existing.id)); // the reload

      await service.run("tenant-1", { staffId: "s1", periodStart: "2026-08-01", periodEnd: "2026-08-31" }, "user-1");

      expect(payouts.save).not.toHaveBeenCalled();
      expect(payouts.create).not.toHaveBeenCalled();
    });

    it("voids the old payout and creates a superseding one when the figure has changed", async () => {
      const existing = {
        id: "payout-1",
        status: IncentivePayoutStatus.FINALISED,
        revenueCents: 5_000,
        commissionCents: 500,
        jobsCompleted: 1,
        perJobCents: 0,
        tierBonusCents: 0,
        totalCents: 500,
      } as IncentivePayout;
      vi.mocked(payouts.findOne)
        .mockResolvedValueOnce(existing) // the live lookup
        .mockResolvedValueOnce(reloaded()); // the reload

      await service.run("tenant-1", { staffId: "s1", periodStart: "2026-08-01", periodEnd: "2026-08-31" }, "user-1");

      const savedCalls = vi.mocked(payouts.save).mock.calls;
      const voided = savedCalls[0][0] as IncentivePayout;
      expect(voided.status).toBe(IncentivePayoutStatus.VOID);
      expect(voided.voidedBy).toBe("user-1");

      const created = vi.mocked(payouts.create).mock.calls[0][0] as Partial<IncentivePayout>;
      expect(created.supersedesPayoutId).toBe("payout-1");
    });
  });

  describe("markPaid", () => {
    it("refuses to mark an already-paid payout paid again", async () => {
      vi.mocked(payouts.findOne).mockResolvedValueOnce({
        id: "payout-1",
        status: IncentivePayoutStatus.PAID,
      } as IncentivePayout);

      await expect(service.markPaid("tenant-1", "payout-1", "user-1")).rejects.toMatchObject({
        code: "PAYOUT_ALREADY_PAID",
      });
    });

    it("refuses to mark a voided payout paid", async () => {
      vi.mocked(payouts.findOne).mockResolvedValueOnce({
        id: "payout-1",
        status: IncentivePayoutStatus.VOID,
      } as IncentivePayout);

      await expect(service.markPaid("tenant-1", "payout-1", "user-1")).rejects.toMatchObject({
        code: "PAYOUT_VOID",
      });
    });

    it("marks a finalised payout paid, stamped with who and when", async () => {
      vi.mocked(payouts.findOne)
        .mockResolvedValueOnce({ id: "payout-1", status: IncentivePayoutStatus.FINALISED } as IncentivePayout)
        .mockResolvedValueOnce(reloaded("payout-1"));

      await service.markPaid("tenant-1", "payout-1", "user-mgr");

      const saved = vi.mocked(payouts.save).mock.calls[0][0] as IncentivePayout;
      expect(saved.status).toBe(IncentivePayoutStatus.PAID);
      expect(saved.paidBy).toBe("user-mgr");
      expect(saved.paidAt).toBeInstanceOf(Date);
    });
  });

  describe("void", () => {
    it("requires a reason to already be present on the DTO layer, and records it here", async () => {
      vi.mocked(payouts.findOne)
        .mockResolvedValueOnce({ id: "payout-1", status: IncentivePayoutStatus.FINALISED } as IncentivePayout)
        .mockResolvedValueOnce(reloaded("payout-1"));

      await service.void("tenant-1", "payout-1", "user-mgr", "Ran against the wrong stylist.");

      const saved = vi.mocked(payouts.save).mock.calls[0][0] as IncentivePayout;
      expect(saved.status).toBe(IncentivePayoutStatus.VOID);
      expect(saved.voidReason).toBe("Ran against the wrong stylist.");
    });

    it("refuses to void an already-void payout", async () => {
      vi.mocked(payouts.findOne).mockResolvedValueOnce({
        id: "payout-1",
        status: IncentivePayoutStatus.VOID,
      } as IncentivePayout);

      await expect(service.void("tenant-1", "payout-1", "user-1", "x")).rejects.toMatchObject({
        code: "PAYOUT_ALREADY_VOID",
      });
    });
  });
});
