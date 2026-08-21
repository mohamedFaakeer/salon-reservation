import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, Repository } from "typeorm";
import { ApiError, IncentivePayoutStatus, type IncentivePayoutQueryDto, type RunIncentivePayoutDto } from "@salon/shared";
import { IncentivePayout } from "../entities/incentive-payout.entity";
import { Staff } from "../entities/staff.entity";
// IncentiveService and AuditService must stay VALUE imports for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentiveService, type StaffEarnings } from "./incentive.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import type { IncentivePayoutSnapshot, IncentivePayoutView } from "./incentive-payout.types";

@Injectable()
export class IncentivePayoutService {
  constructor(
    @InjectRepository(IncentivePayout) private readonly payouts: Repository<IncentivePayout>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly incentives: IncentiveService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, query: IncentivePayoutQueryDto): Promise<IncentivePayoutView[]> {
    const rows = await this.payouts.find({
      where: {
        tenantId,
        ...(query.staffId ? { staffId: query.staffId } : {}),
        ...(query.status ? { status: query.status as IncentivePayoutStatus } : {}),
      },
      relations: { staff: true, finalisedByUser: true, paidByUser: true, voidedByUser: true },
      order: { createdAt: "DESC" },
    });
    return rows.map(toView);
  }

  async get(tenantId: string, id: string): Promise<IncentivePayoutView> {
    return toView(await this.findOwned(tenantId, id));
  }

  /**
   * Finalise one staff member's figure for a period.
   *
   * Idempotent on the money, same shape as `InvoiceService.issueFor`: if a
   * live payout already exists for this exact period and the freshly
   * computed figure hasn't moved, it is returned unchanged rather than a
   * near-identical duplicate being cut. A changed figure voids the old row
   * and inserts a new one — corrections supersede, they never edit history.
   */
  async run(tenantId: string, dto: RunIncentivePayoutDto, actorUserId: string): Promise<IncentivePayoutView> {
    if (dto.periodEnd < dto.periodStart) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_DATE_RANGE",
        message: "The period's end date must be on or after its start date.",
      });
    }

    const staffRow = await this.staff.findOne({ where: { tenantId, id: dto.staffId } });
    if (!staffRow) {
      throw new ApiError({ statusCode: 404, code: "STAFF_NOT_FOUND", message: "Staff member not found." });
    }

    const earnings = await this.incentives.earningsFor(tenantId, dto.staffId, {
      from: dto.periodStart,
      to: dto.periodEnd,
    });
    if (!earnings) {
      throw new ApiError({
        statusCode: 409,
        code: "NO_INCENTIVE_PLAN",
        message: `${staffRow.name} has no incentive plan assigned — assign one before running a payout.`,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const payoutRepo = manager.getRepository(IncentivePayout);
      const current = await payoutRepo.findOne({
        where: { tenantId, staffId: dto.staffId, periodStart: dto.periodStart, periodEnd: dto.periodEnd },
        order: { createdAt: "DESC" },
      });
      const live = current && current.status !== IncentivePayoutStatus.VOID ? current : null;

      if (live && figuresMatch(live, earnings)) {
        return toView(await this.reload(manager, live.id));
      }

      if (live) {
        live.status = IncentivePayoutStatus.VOID;
        live.voidedAt = new Date();
        live.voidedBy = actorUserId;
        live.voidReason = "Superseded by a recomputed payout for the same period.";
        await payoutRepo.save(live);
      }

      const snapshot = buildSnapshot(earnings);
      const payout = await payoutRepo.save(
        payoutRepo.create({
          tenantId,
          staffId: dto.staffId,
          planId: earnings.plan.id,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          status: IncentivePayoutStatus.FINALISED,
          revenueCents: earnings.breakdown.revenueCents,
          commissionCents: earnings.breakdown.commissionCents,
          jobsCompleted: earnings.breakdown.jobsCompleted,
          perJobCents: earnings.breakdown.perJobCents,
          tierBonusCents: earnings.breakdown.tierBonusCents,
          totalCents: earnings.breakdown.totalCents,
          snapshot,
          supersedesPayoutId: live?.id ?? null,
          finalisedBy: actorUserId,
        }),
      );

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: live ? "INCENTIVE_PAYOUT_SUPERSEDED" : "INCENTIVE_PAYOUT_FINALISED",
          entityType: "IncentivePayout",
          entityId: payout.id,
          metadata: {
            staffId: dto.staffId,
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            totalCents: payout.totalCents,
            supersedes: live?.id ?? null,
          },
        },
        manager,
      );

      return toView(await this.reload(manager, payout.id));
    });
  }

  async markPaid(tenantId: string, id: string, actorUserId: string): Promise<IncentivePayoutView> {
    const payout = await this.findOwned(tenantId, id);
    if (payout.status === IncentivePayoutStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "PAYOUT_VOID", message: "This payout was voided and can't be marked paid." });
    }
    if (payout.status === IncentivePayoutStatus.PAID) {
      throw new ApiError({ statusCode: 409, code: "PAYOUT_ALREADY_PAID", message: "This payout is already marked paid." });
    }

    payout.status = IncentivePayoutStatus.PAID;
    payout.paidAt = new Date();
    payout.paidBy = actorUserId;
    await this.payouts.save(payout);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "INCENTIVE_PAYOUT_PAID",
      entityType: "IncentivePayout",
      entityId: payout.id,
      metadata: { staffId: payout.staffId, totalCents: payout.totalCents },
    });

    return this.get(tenantId, id);
  }

  /** A manual correction — voided without a replacement, e.g. it was run against the wrong person. */
  async void(tenantId: string, id: string, actorUserId: string, reason: string): Promise<IncentivePayoutView> {
    const payout = await this.findOwned(tenantId, id);
    if (payout.status === IncentivePayoutStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "PAYOUT_ALREADY_VOID", message: "This payout is already void." });
    }

    payout.status = IncentivePayoutStatus.VOID;
    payout.voidedAt = new Date();
    payout.voidedBy = actorUserId;
    payout.voidReason = reason.trim();
    await this.payouts.save(payout);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "INCENTIVE_PAYOUT_VOIDED",
      entityType: "IncentivePayout",
      entityId: payout.id,
      metadata: { staffId: payout.staffId, reason: payout.voidReason },
    });

    return this.get(tenantId, id);
  }

  private async findOwned(tenantId: string, id: string): Promise<IncentivePayout> {
    const payout = await this.payouts.findOne({
      where: { tenantId, id },
      relations: { staff: true, finalisedByUser: true, paidByUser: true, voidedByUser: true },
    });
    if (!payout) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Payout not found." });
    }
    return payout;
  }

  private async reload(manager: DataSource["manager"], id: string): Promise<IncentivePayout> {
    const payout = await manager.getRepository(IncentivePayout).findOne({
      where: { id },
      relations: { staff: true, finalisedByUser: true, paidByUser: true, voidedByUser: true },
    });
    if (!payout) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Payout not found." });
    }
    return payout;
  }
}

function figuresMatch(payout: IncentivePayout, earnings: StaffEarnings): boolean {
  return (
    payout.revenueCents === earnings.breakdown.revenueCents &&
    payout.commissionCents === earnings.breakdown.commissionCents &&
    payout.jobsCompleted === earnings.breakdown.jobsCompleted &&
    payout.perJobCents === earnings.breakdown.perJobCents &&
    payout.tierBonusCents === earnings.breakdown.tierBonusCents &&
    payout.totalCents === earnings.breakdown.totalCents
  );
}

function buildSnapshot(earnings: StaffEarnings): IncentivePayoutSnapshot {
  return {
    plan: {
      name: earnings.plan.name,
      baseCommissionPercent: earnings.plan.baseCommissionPercent,
      perJobAmountCents: earnings.plan.perJobAmountCents,
      monthlyTargetCents: earnings.plan.monthlyTargetCents,
      tierBonusPercent: earnings.plan.tierBonusPercent,
      serviceRates: (earnings.plan.serviceRates ?? []).map((r) => ({
        serviceId: r.serviceId,
        serviceName: r.service?.name ?? "",
        ratePercent: r.ratePercent,
      })),
    },
    lines: earnings.lines,
  };
}

function toView(payout: IncentivePayout): IncentivePayoutView {
  return {
    id: payout.id,
    staffId: payout.staffId,
    staffName: payout.staff?.name ?? "",
    planId: payout.planId,
    planName: (payout.snapshot as IncentivePayoutSnapshot).plan.name,
    periodStart: payout.periodStart,
    periodEnd: payout.periodEnd,
    status: payout.status as "FINALISED" | "PAID" | "VOID",
    revenueCents: payout.revenueCents,
    commissionCents: payout.commissionCents,
    jobsCompleted: payout.jobsCompleted,
    perJobCents: payout.perJobCents,
    tierBonusCents: payout.tierBonusCents,
    totalCents: payout.totalCents,
    snapshot: payout.snapshot as IncentivePayoutSnapshot,
    supersedesPayoutId: payout.supersedesPayoutId,
    finalisedByName: payout.finalisedByUser?.name ?? "",
    paidAt: payout.paidAt?.toISOString() ?? null,
    paidByName: payout.paidByUser?.name ?? null,
    voidedAt: payout.voidedAt?.toISOString() ?? null,
    voidedByName: payout.voidedByUser?.name ?? null,
    voidReason: payout.voidReason,
    createdAt: payout.createdAt.toISOString(),
  };
}
