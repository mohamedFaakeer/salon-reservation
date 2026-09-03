import type { ObjectLiteral, Repository } from "typeorm";
import { PayrollRunStatus } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollReportService } from "./payroll-report.service";
import type { PayrollRun, PayrollRunLine } from "../entities/payroll-run.entity";

function mockRepo<T extends ObjectLiteral>() {
  return { find: vi.fn(async () => [] as T[]) } as unknown as Repository<T>;
}

function line(overrides: Partial<PayrollRunLine> = {}): PayrollRunLine {
  return {
    staffId: "s1",
    staffName: "Nadia",
    payFrequency: "MONTHLY",
    basePayCents: 300_000_00,
    unpaidAbsenceDays: 0,
    unresolvedClosureDays: 0,
    incentiveCents: 20_000_00,
    incentiveSource: "LIVE_ESTIMATE",
    payComponents: [],
    allowancesCents: 5_000_00,
    deductionsCents: 2_000_00,
    grossCents: 325_000_00,
    statutory: { epfEmployeeCents: 24_000_00, epfEmployerCents: 36_000_00, etfEmployerCents: 9_000_00, apitCents: 1_000_00, verified: true },
    netCents: 298_000_00,
    ...overrides,
  };
}

function run(overrides: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: "run-1",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    status: PayrollRunStatus.PAID,
    staffCount: 1,
    totalGrossCents: 325_000_00,
    totalNetCents: 298_000_00,
    snapshot: [line()],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("PayrollReportService", () => {
  let runs: Repository<PayrollRun>;
  let service: PayrollReportService;

  beforeEach(() => {
    runs = mockRepo<PayrollRun>();
    service = new PayrollReportService(runs);
  });

  it("rejects an end date before the start date", async () => {
    await expect(service.summary("tenant-1", "2026-09-30", "2026-09-01")).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
  });

  it("sums every figure across every matching run's lines", async () => {
    vi.mocked(runs.find).mockResolvedValue([run()]);
    const result = await service.summary("tenant-1", "2026-01-01", "2026-12-31");

    expect(result.runsCount).toBe(1);
    expect(result.staffCount).toBe(1);
    expect(result.totalBasePayCents).toBe(300_000_00);
    expect(result.totalIncentiveCents).toBe(20_000_00);
    expect(result.totalAllowancesCents).toBe(5_000_00);
    expect(result.totalDeductionsCents).toBe(2_000_00);
    expect(result.totalGrossCents).toBe(325_000_00);
    expect(result.totalEpfEmployeeCents).toBe(24_000_00);
    expect(result.totalEpfEmployerCents).toBe(36_000_00);
    expect(result.totalEtfEmployerCents).toBe(9_000_00);
    expect(result.totalApitCents).toBe(1_000_00);
    expect(result.totalNetCents).toBe(298_000_00);
  });

  it("computes total employer cost as gross plus employer EPF/ETF, not just what staff took home", async () => {
    vi.mocked(runs.find).mockResolvedValue([run()]);
    const result = await service.summary("tenant-1", "2026-01-01", "2026-12-31");
    expect(result.totalEmployerCostCents).toBe(325_000_00 + 36_000_00 + 9_000_00);
  });

  it("counts distinct staff across multiple runs and lines, not one count per line", async () => {
    vi.mocked(runs.find).mockResolvedValue([
      run({ id: "run-1", snapshot: [line({ staffId: "s1" }), line({ staffId: "s2" })] }),
      run({ id: "run-2", snapshot: [line({ staffId: "s1" })] }),
    ]);
    const result = await service.summary("tenant-1", "2026-01-01", "2026-12-31");
    expect(result.staffCount).toBe(2);
    expect(result.runsCount).toBe(2);
  });

  it("excludes a line's statutory contribution to totals when statutory is null", async () => {
    vi.mocked(runs.find).mockResolvedValue([run({ snapshot: [line({ statutory: null })] })]);
    const result = await service.summary("tenant-1", "2026-01-01", "2026-12-31");
    expect(result.totalEpfEmployeeCents).toBe(0);
    expect(result.totalApitCents).toBe(0);
  });

  it("queries only non-void runs fully contained in the range", async () => {
    vi.mocked(runs.find).mockResolvedValue([]);
    await service.summary("tenant-1", "2026-01-01", "2026-12-31");
    const call = vi.mocked(runs.find).mock.calls[0][0] as { where: { status: unknown } };
    expect(call.where.status).not.toBe(PayrollRunStatus.VOID);
  });

  it("scopes the query to the caller's own tenantId — a cost report can never sum another tenant's runs", async () => {
    vi.mocked(runs.find).mockResolvedValue([]);
    await service.summary("tenant-1", "2026-01-01", "2026-12-31");
    expect(runs.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }) }));
  });
});
