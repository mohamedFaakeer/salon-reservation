import type { ObjectLiteral, Repository } from "typeorm";
import { PayFrequency, PayrollPaymentMethod, PayrollRunStatus } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollRunService } from "./payroll-run.service";
import type { PayrollRun } from "../entities/payroll-run.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { EmploymentService } from "./employment.service";
import type { EmploymentView } from "./employment.types";
import type { PayrollPreviewService } from "./payroll-preview.service";
import type { PayrollPreviewView } from "./payroll-preview.types";
import type { StatutoryRuleSetService } from "./statutory-rule-set.service";
import type { StatutoryRuleSetView } from "./statutory-rule-set.types";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function employmentView(overrides: Partial<EmploymentView> = {}): EmploymentView {
  return {
    id: "emp-1",
    staffId: "s1",
    staffName: "Nadia",
    payFrequency: PayFrequency.MONTHLY,
    baseRateCents: 300_000_00,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    supersedesEmploymentId: null,
    createdByName: "Owner",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function grossFor(staffId: string, overrides: Partial<PayrollPreviewView> = {}): PayrollPreviewView {
  return {
    staffId,
    staffName: "Nadia",
    from: "2026-09-01",
    to: "2026-09-30",
    basePay: { staffId, staffName: "Nadia", from: "2026-09-01", to: "2026-09-30", earnedCents: 300_000_00, unpaidAbsenceDays: 0, unresolvedClosureDays: 0, daysWithoutEmployment: 0, days: [] },
    incentive: null,
    payComponents: [],
    allowancesCents: 0,
    deductionsCents: 0,
    epfApplicableEarningsCents: 300_000_00,
    etfApplicableEarningsCents: 300_000_00,
    totalCents: 300_000_00,
    ...overrides,
  };
}

function reloadedRun(overrides: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: "generated-id",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    status: PayrollRunStatus.SUBMITTED,
    staffCount: 1,
    totalGrossCents: 300_000_00,
    totalNetCents: 300_000_00,
    snapshot: [],
    submittedByUser: { name: "Owner" },
    approvedByUser: null,
    approvedAt: null,
    paidByUser: null,
    paidAt: null,
    voidedByUser: null,
    voidedAt: null,
    voidReason: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("PayrollRunService", () => {
  let runs: Repository<PayrollRun>;
  let tenants: Repository<Tenant>;
  let employment: { listCurrent: ReturnType<typeof vi.fn> };
  let payrollPreview: { preview: ReturnType<typeof vi.fn> };
  let ruleSets: { current: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: PayrollRunService;

  beforeEach(() => {
    runs = mockRepo<PayrollRun>();
    tenants = mockRepo<Tenant>();
    employment = { listCurrent: vi.fn(async () => [employmentView()]) };
    payrollPreview = { preview: vi.fn(async (_t: string, q: { staffId: string }) => grossFor(q.staffId)) };
    ruleSets = { current: vi.fn(async () => null as StatutoryRuleSetView | null) };
    audit = { record: vi.fn(async () => undefined) };
    dataSource = { transaction: vi.fn(async (cb: (manager: unknown) => Promise<unknown>) => cb({ getRepository: () => runs })) };
    vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: false } as Tenant);

    service = new PayrollRunService(
      runs,
      tenants,
      employment as unknown as EmploymentService,
      payrollPreview as unknown as PayrollPreviewService,
      ruleSets as unknown as StatutoryRuleSetService,
      audit as never,
      dataSource as never,
    );
  });

  describe("tenant isolation", () => {
    it("get() scopes the lookup by tenantId, so another tenant's run id is not found", async () => {
      vi.mocked(runs.findOne).mockResolvedValue(null);
      await expect(service.get("tenant-1", "someone-elses-run")).rejects.toMatchObject({ code: "PAYROLL_RUN_NOT_FOUND" });
      expect(runs.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-1", id: "someone-elses-run" } }));
    });

    it("list() only ever queries the caller's own tenantId, never a client-suppliable value", async () => {
      await service.list("tenant-1", {});
      expect(runs.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }) }));
    });
  });

  describe("run", () => {
    it("rejects an end date before the start date", async () => {
      await expect(service.run("tenant-1", { periodStart: "2026-09-30", periodEnd: "2026-09-01" }, "user-1", false)).rejects.toMatchObject({
        code: "INVALID_DATE_RANGE",
      });
    });

    it("refuses when no staff member has an employment profile", async () => {
      employment.listCurrent.mockResolvedValue([]);
      await expect(service.run("tenant-1", { periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "user-1", false)).rejects.toMatchObject({
        code: "NO_ELIGIBLE_STAFF",
      });
    });

    it("submits a run combining base pay and incentive, with no statutory line when the tenant isn't enabled", async () => {
      payrollPreview.preview.mockResolvedValue(grossFor("s1", { totalCents: 325_000_00, incentive: { source: "LIVE_ESTIMATE", totalCents: 25_000_00, payoutId: null } }));
      vi.mocked(runs.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(reloadedRun());

      const result = await service.run("tenant-1", { periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "user-1", true);

      expect(result.staffCount).toBe(1);
      expect(runs.save).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: [expect.objectContaining({ staffId: "s1", grossCents: 325_000_00, incentiveCents: 25_000_00, statutory: null, netCents: 325_000_00 })],
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "PAYROLL_RUN_SUBMITTED" }), expect.anything());
    });

    it("includes a statutory line only when the tenant is enabled, a rule set exists, and the period is a full calendar month", async () => {
      vi.mocked(tenants.findOne).mockResolvedValue({ statutoryPayrollEnabled: true } as Tenant);
      ruleSets.current.mockResolvedValue({
        id: "rule-1",
        epfEmployeePercent: 8,
        epfEmployerPercent: 12,
        etfEmployerPercent: 3,
        apitMonthlyFreeThresholdCents: 150_000_00,
        apitBands: [{ uptoCents: null, ratePercent: 6 }],
        verified: true,
      } as StatutoryRuleSetView);
      vi.mocked(runs.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(reloadedRun());

      await service.run("tenant-1", { periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "user-1", false);

      const saved = vi.mocked(runs.save).mock.calls[0][0] as PayrollRun;
      expect(saved.snapshot[0].statutory).not.toBeNull();
      expect(saved.snapshot[0].statutory!.verified).toBe(true);
      expect(saved.snapshot[0].netCents).toBeLessThan(saved.snapshot[0].grossCents);
    });

    it("is idempotent on the money: an unchanged figure returns the existing live run without saving a new one", async () => {
      const live = reloadedRun({ totalGrossCents: 300_000_00, totalNetCents: 300_000_00, staffCount: 1 });
      vi.mocked(runs.findOne).mockResolvedValue(live);

      const result = await service.run("tenant-1", { periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "user-1", false);

      expect(result.id).toBe(live.id);
      expect(runs.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("voids the old run and submits a fresh one when the figure has moved", async () => {
      const live = reloadedRun({ id: "old-1", totalGrossCents: 100_000_00, totalNetCents: 100_000_00, staffCount: 1 });
      vi.mocked(runs.findOne).mockResolvedValueOnce(live).mockResolvedValueOnce(reloadedRun({ id: "new-1" }));

      await service.run("tenant-1", { periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "user-1", false);

      expect(runs.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "old-1", status: PayrollRunStatus.VOID }));
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "PAYROLL_RUN_SUPERSEDED" }), expect.anything());
    });

    it("refuses to supersede an already-paid run", async () => {
      const live = reloadedRun({ status: PayrollRunStatus.PAID, totalGrossCents: 100_000_00 });
      vi.mocked(runs.findOne).mockResolvedValue(live);
      await expect(service.run("tenant-1", { periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "user-1", false)).rejects.toMatchObject({
        code: "PAYROLL_RUN_ALREADY_PAID",
      });
    });
  });

  describe("status transitions", () => {
    it("approve requires SUBMITTED", async () => {
      vi.mocked(runs.findOne).mockResolvedValue(reloadedRun({ status: PayrollRunStatus.APPROVED }));
      await expect(service.approve("tenant-1", "run-1", "user-1")).rejects.toMatchObject({ code: "PAYROLL_RUN_NOT_SUBMITTED" });
    });

    it("markPaid requires APPROVED", async () => {
      vi.mocked(runs.findOne).mockResolvedValue(reloadedRun({ status: PayrollRunStatus.SUBMITTED }));
      await expect(
        service.markPaid("tenant-1", "run-1", "user-1", { paymentMethod: PayrollPaymentMethod.CASH }),
      ).rejects.toMatchObject({ code: "PAYROLL_RUN_NOT_APPROVED" });
    });

    it("markPaid records how the money moved", async () => {
      vi.mocked(runs.findOne).mockResolvedValue(reloadedRun({ status: PayrollRunStatus.APPROVED }));
      await service.markPaid("tenant-1", "run-1", "user-2", {
        paymentMethod: PayrollPaymentMethod.BANK_TRANSFER,
        reference: "Batch #4471",
      });
      expect(runs.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PayrollRunStatus.PAID,
          paidBy: "user-2",
          paymentMethod: PayrollPaymentMethod.BANK_TRANSFER,
          paymentReference: "Batch #4471",
        }),
      );
    });

    it("void refuses an already-void run", async () => {
      vi.mocked(runs.findOne).mockResolvedValue(reloadedRun({ status: PayrollRunStatus.VOID }));
      await expect(service.void("tenant-1", "run-1", "user-1", "mistake")).rejects.toMatchObject({ code: "PAYROLL_RUN_ALREADY_VOID" });
    });

    it("approve moves SUBMITTED to APPROVED and records the actor", async () => {
      vi.mocked(runs.findOne).mockResolvedValue(reloadedRun({ status: PayrollRunStatus.SUBMITTED }));
      await service.approve("tenant-1", "run-1", "user-2");
      expect(runs.save).toHaveBeenCalledWith(expect.objectContaining({ status: PayrollRunStatus.APPROVED, approvedBy: "user-2" }));
    });
  });
});
