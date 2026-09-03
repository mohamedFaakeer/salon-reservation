import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LessThanOrEqual, MoreThanOrEqual, Not, Repository } from "typeorm";
import { ApiError, PayrollRunStatus } from "@salon/shared";
import { PayrollRun } from "../entities/payroll-run.entity";
import type { PayrollCostSummaryView, PayrollReportRunRow } from "./payroll-report.types";

@Injectable()
export class PayrollReportService {
  constructor(@InjectRepository(PayrollRun) private readonly runs: Repository<PayrollRun>) {}

  /**
   * Every non-void run fully contained in `[from, to]` — a run that only
   * partly overlaps the requested range is excluded rather than counted at
   * a fraction, so a total here is always the sum of whole, real runs, never
   * a partial figure presented as if it were complete.
   *
   * Reads `PayrollRun.snapshot` directly rather than persisting a second
   * copy of these totals anywhere — the same "one source of truth" reasoning
   * every other report in this codebase already follows.
   */
  async summary(tenantId: string, from: string, to: string): Promise<PayrollCostSummaryView> {
    if (to < from) {
      throw new ApiError({ statusCode: 400, code: "INVALID_DATE_RANGE", message: "The end date must be on or after the start date." });
    }

    const runs = await this.runs.find({
      where: {
        tenantId,
        status: Not(PayrollRunStatus.VOID),
        periodStart: MoreThanOrEqual(from),
        periodEnd: LessThanOrEqual(to),
      },
      order: { periodStart: "ASC" },
    });

    const totals = {
      totalBasePayCents: 0,
      totalIncentiveCents: 0,
      totalAllowancesCents: 0,
      totalDeductionsCents: 0,
      totalGrossCents: 0,
      totalEpfEmployeeCents: 0,
      totalEpfEmployerCents: 0,
      totalEtfEmployerCents: 0,
      totalApitCents: 0,
      totalNetCents: 0,
    };
    const staffIds = new Set<string>();
    const runRows: PayrollReportRunRow[] = [];

    for (const run of runs) {
      let employerStatutoryCostCents = 0;
      for (const line of run.snapshot) {
        staffIds.add(line.staffId);
        totals.totalBasePayCents += line.basePayCents;
        totals.totalIncentiveCents += line.incentiveCents;
        totals.totalAllowancesCents += line.allowancesCents;
        totals.totalDeductionsCents += line.deductionsCents;
        totals.totalGrossCents += line.grossCents;
        totals.totalNetCents += line.netCents;
        if (line.statutory) {
          totals.totalEpfEmployeeCents += line.statutory.epfEmployeeCents;
          totals.totalEpfEmployerCents += line.statutory.epfEmployerCents;
          totals.totalEtfEmployerCents += line.statutory.etfEmployerCents;
          totals.totalApitCents += line.statutory.apitCents;
          employerStatutoryCostCents += line.statutory.epfEmployerCents + line.statutory.etfEmployerCents;
        }
      }

      runRows.push({
        id: run.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        status: run.status,
        staffCount: run.staffCount,
        grossCents: run.totalGrossCents,
        employerStatutoryCostCents,
        netCents: run.totalNetCents,
      });
    }

    return {
      from,
      to,
      runsCount: runs.length,
      staffCount: staffIds.size,
      ...totals,
      totalEmployerCostCents: totals.totalGrossCents + totals.totalEpfEmployerCents + totals.totalEtfEmployerCents,
      runs: runRows,
    };
  }
}
