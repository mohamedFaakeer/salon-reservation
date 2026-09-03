import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, Not, Repository } from "typeorm";
import { ApiError, PayrollRunStatus, type MarkPayrollRunPaidDto, type PayrollRunQueryDto, type RunPayrollDto } from "@salon/shared";
import { PayrollRun, type PayrollRunLine } from "../entities/payroll-run.entity";
import { Tenant } from "../entities/tenant.entity";
// EmploymentService, PayrollPreviewService, StatutoryRuleSetService, and
// AuditService must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmploymentService } from "./employment.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollPreviewService } from "./payroll-preview.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StatutoryRuleSetService } from "./statutory-rule-set.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import { isFullCalendarMonth } from "./payroll.domain";
import { computeApitForMonth, computeEpfEtf } from "./statutory.domain";
import type { PayrollRunView } from "./payroll-run.types";

@Injectable()
export class PayrollRunService {
  constructor(
    @InjectRepository(PayrollRun) private readonly runs: Repository<PayrollRun>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly employment: EmploymentService,
    private readonly payrollPreview: PayrollPreviewService,
    private readonly ruleSets: StatutoryRuleSetService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, query: PayrollRunQueryDto): Promise<PayrollRunView[]> {
    const rows = await this.runs.find({
      where: { tenantId, ...(query.status ? { status: query.status as PayrollRunStatus } : {}) },
      relations: { submittedByUser: true, approvedByUser: true, paidByUser: true, voidedByUser: true },
      order: { createdAt: "DESC" },
    });
    return rows.map(toView);
  }

  async get(tenantId: string, id: string): Promise<PayrollRunView> {
    return toView(await this.findOwned(tenantId, id));
  }

  /**
   * Submits a run for a period, covering every staff member who currently
   * has an employment profile (a leaver whose profile has since been
   * removed won't appear — a known v1 limitation, not a silent gap).
   *
   * Idempotent on the money, same shape as `IncentivePayoutService.run`: an
   * unchanged total returns the existing live run; a moved total voids it
   * and submits a fresh one — never edited in place. Statutory figures are
   * computed inline here (not via `StatutoryPreviewService`, which throws
   * when the tenant isn't enabled) so a run can be submitted normally for
   * the majority of tenants who don't have statutory calculations on yet,
   * with every line's `statutory` simply `null`.
   */
  async run(tenantId: string, dto: RunPayrollDto, actorUserId: string, incentivesEnabled: boolean): Promise<PayrollRunView> {
    if (dto.periodEnd < dto.periodStart) {
      throw new ApiError({ statusCode: 400, code: "INVALID_DATE_RANGE", message: "The period's end date must be on or after its start date." });
    }

    const employed = await this.employment.listCurrent(tenantId);
    if (employed.length === 0) {
      throw new ApiError({
        statusCode: 409,
        code: "NO_ELIGIBLE_STAFF",
        message: "No staff member has an employment profile set up yet — there's nothing to run payroll for.",
      });
    }

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    const statutoryEligiblePeriod = Boolean(tenant?.statutoryPayrollEnabled) && isFullCalendarMonth(dto.periodStart, dto.periodEnd);
    const ruleSet = statutoryEligiblePeriod ? await this.ruleSets.current() : null;

    const lines: PayrollRunLine[] = [];
    for (const staffRow of employed) {
      const gross = await this.payrollPreview.preview(tenantId, { staffId: staffRow.staffId, from: dto.periodStart, to: dto.periodEnd }, incentivesEnabled);

      let statutory: PayrollRunLine["statutory"] = null;
      if (ruleSet) {
        const epfEtf = computeEpfEtf(gross.totalCents, ruleSet);
        const apitCents = computeApitForMonth(gross.totalCents, ruleSet.apitMonthlyFreeThresholdCents, ruleSet.apitBands);
        statutory = { ...epfEtf, apitCents, verified: ruleSet.verified };
      }

      lines.push({
        staffId: gross.staffId,
        staffName: gross.staffName,
        payFrequency: staffRow.payFrequency,
        basePayCents: gross.basePay.earnedCents,
        unpaidAbsenceDays: gross.basePay.unpaidAbsenceDays,
        unresolvedClosureDays: gross.basePay.unresolvedClosureDays,
        incentiveCents: gross.incentive?.totalCents ?? 0,
        incentiveSource: gross.incentive?.source ?? null,
        grossCents: gross.totalCents,
        statutory,
        netCents: statutory ? gross.totalCents - statutory.epfEmployeeCents - statutory.apitCents : gross.totalCents,
      });
    }

    const totalGrossCents = lines.reduce((sum, l) => sum + l.grossCents, 0);
    const totalNetCents = lines.reduce((sum, l) => sum + l.netCents, 0);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PayrollRun);
      const live = await repo.findOne({
        where: { tenantId, periodStart: dto.periodStart, periodEnd: dto.periodEnd, status: Not(PayrollRunStatus.VOID) },
        relations: { submittedByUser: true, approvedByUser: true, paidByUser: true, voidedByUser: true },
      });

      if (live && live.totalGrossCents === totalGrossCents && live.totalNetCents === totalNetCents && live.staffCount === lines.length) {
        return toView(live);
      }

      if (live) {
        if (live.status === PayrollRunStatus.PAID) {
          throw new ApiError({
            statusCode: 409,
            code: "PAYROLL_RUN_ALREADY_PAID",
            message: "This period has already been paid out. Void it first if the figures genuinely need correcting.",
          });
        }
        live.status = PayrollRunStatus.VOID;
        live.voidedAt = new Date();
        live.voidedBy = actorUserId;
        live.voidReason = "Superseded by a resubmitted run for the same period.";
        await repo.save(live);
      }

      const created = await repo.save(
        repo.create({
          tenantId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          status: PayrollRunStatus.SUBMITTED,
          staffCount: lines.length,
          totalGrossCents,
          totalNetCents,
          snapshot: lines,
          submittedBy: actorUserId,
        }),
      );

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: live ? "PAYROLL_RUN_SUPERSEDED" : "PAYROLL_RUN_SUBMITTED",
          entityType: "PayrollRun",
          entityId: created.id,
          metadata: { periodStart: dto.periodStart, periodEnd: dto.periodEnd, staffCount: lines.length, totalGrossCents, totalNetCents },
        },
        manager,
      );

      return toView(await this.reload(manager, created.id));
    });
  }

  async approve(tenantId: string, id: string, actorUserId: string): Promise<PayrollRunView> {
    const run = await this.findOwned(tenantId, id);
    if (run.status !== PayrollRunStatus.SUBMITTED) {
      throw new ApiError({ statusCode: 409, code: "PAYROLL_RUN_NOT_SUBMITTED", message: "Only a submitted run awaiting review can be approved." });
    }

    run.status = PayrollRunStatus.APPROVED;
    run.approvedAt = new Date();
    run.approvedBy = actorUserId;
    await this.runs.save(run);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PAYROLL_RUN_APPROVED",
      entityType: "PayrollRun",
      entityId: run.id,
      metadata: { periodStart: run.periodStart, periodEnd: run.periodEnd, totalNetCents: run.totalNetCents },
    });

    return this.get(tenantId, id);
  }

  async markPaid(tenantId: string, id: string, actorUserId: string, dto: MarkPayrollRunPaidDto): Promise<PayrollRunView> {
    const run = await this.findOwned(tenantId, id);
    if (run.status !== PayrollRunStatus.APPROVED) {
      throw new ApiError({ statusCode: 409, code: "PAYROLL_RUN_NOT_APPROVED", message: "A run must be approved before it can be marked paid." });
    }

    run.status = PayrollRunStatus.PAID;
    run.paidAt = new Date();
    run.paidBy = actorUserId;
    run.paymentMethod = dto.paymentMethod;
    run.paymentReference = dto.reference?.trim() ?? null;
    await this.runs.save(run);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PAYROLL_RUN_PAID",
      entityType: "PayrollRun",
      entityId: run.id,
      metadata: {
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        totalNetCents: run.totalNetCents,
        paymentMethod: dto.paymentMethod,
      },
    });

    return this.get(tenantId, id);
  }

  /** A manual correction — voided without a replacement, e.g. it was run for the wrong period. */
  async void(tenantId: string, id: string, actorUserId: string, reason: string): Promise<PayrollRunView> {
    const run = await this.findOwned(tenantId, id);
    if (run.status === PayrollRunStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "PAYROLL_RUN_ALREADY_VOID", message: "This run is already void." });
    }

    run.status = PayrollRunStatus.VOID;
    run.voidedAt = new Date();
    run.voidedBy = actorUserId;
    run.voidReason = reason.trim();
    await this.runs.save(run);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PAYROLL_RUN_VOIDED",
      entityType: "PayrollRun",
      entityId: run.id,
      metadata: { periodStart: run.periodStart, periodEnd: run.periodEnd, reason: run.voidReason },
    });

    return this.get(tenantId, id);
  }

  private async findOwned(tenantId: string, id: string): Promise<PayrollRun> {
    const run = await this.runs.findOne({
      where: { tenantId, id },
      relations: { submittedByUser: true, approvedByUser: true, paidByUser: true, voidedByUser: true },
    });
    if (!run) {
      throw new ApiError({ statusCode: 404, code: "PAYROLL_RUN_NOT_FOUND", message: "Payroll run not found." });
    }
    return run;
  }

  private async reload(manager: DataSource["manager"], id: string): Promise<PayrollRun> {
    const run = await manager.getRepository(PayrollRun).findOne({
      where: { id },
      relations: { submittedByUser: true, approvedByUser: true, paidByUser: true, voidedByUser: true },
    });
    if (!run) {
      throw new ApiError({ statusCode: 404, code: "PAYROLL_RUN_NOT_FOUND", message: "Payroll run not found." });
    }
    return run;
  }
}

function toView(run: PayrollRun): PayrollRunView {
  return {
    id: run.id,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    status: run.status,
    staffCount: run.staffCount,
    totalGrossCents: run.totalGrossCents,
    totalNetCents: run.totalNetCents,
    lines: run.snapshot,
    submittedByName: run.submittedByUser?.name ?? "",
    submittedAt: run.createdAt.toISOString(),
    approvedByName: run.approvedByUser?.name ?? null,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    paidByName: run.paidByUser?.name ?? null,
    paidAt: run.paidAt?.toISOString() ?? null,
    paymentMethod: run.paymentMethod,
    paymentReference: run.paymentReference,
    voidedByName: run.voidedByUser?.name ?? null,
    voidedAt: run.voidedAt?.toISOString() ?? null,
    voidReason: run.voidReason,
  };
}
