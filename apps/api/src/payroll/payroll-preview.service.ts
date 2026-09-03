import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Not, Repository } from "typeorm";
import { IncentivePayoutStatus, type BasePayPreviewQueryDto } from "@salon/shared";
import { IncentivePayout } from "../entities/incentive-payout.entity";
// BasePayService and IncentiveService must stay VALUE imports: NestJS
// resolves constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BasePayService } from "./base-pay.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentiveService } from "../incentive/incentive.service";
// PayComponentService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayComponentService } from "./pay-component.service";
import { computeEarningsBases } from "./pay-component.domain";
import type { PayrollIncentiveComponent, PayrollPreviewView } from "./payroll-preview.types";

/**
 * A payroll run's real shape: base pay plus that period's commission, read
 * together rather than shown on two separate screens. Deliberately does not
 * touch, move, or duplicate anything in `apps/api/src/incentive/` — that
 * module stays exactly as it is, usable entirely on its own for a tenant
 * with Incentives but not Payroll enabled (DECISIONS.md §62/§64). This
 * service is just a second reader of the same commission data, the same way
 * `IncentiveModule` itself already reads `Payment`/`Appointment` rows it
 * doesn't own.
 */
@Injectable()
export class PayrollPreviewService {
  constructor(
    private readonly basePay: BasePayService,
    private readonly incentives: IncentiveService,
    private readonly payComponents: PayComponentService,
    @InjectRepository(IncentivePayout) private readonly payouts: Repository<IncentivePayout>,
  ) {}

  /**
   * `incentivesEnabled` reflects the tenant's own entitlements — a tenant
   * without the Incentives module included never gets an incentive
   * component here, whatever payroll-only data might technically exist.
   *
   * This is the one place allowances/deductions are fetched and folded in
   * (DECISIONS.md §69) — `PayrollRunService`/`StatutoryPreviewService` both
   * read the resulting `allowancesCents`/`deductionsCents`/
   * `epfApplicableEarningsCents`/`etfApplicableEarningsCents` off this
   * result rather than re-fetching components themselves, so there's one
   * place the earnings-bases math can't quietly drift from the run/preview.
   */
  async preview(tenantId: string, dto: BasePayPreviewQueryDto, incentivesEnabled: boolean): Promise<PayrollPreviewView> {
    const [basePay, componentViews] = await Promise.all([
      this.basePay.preview(tenantId, dto),
      this.payComponents.list(tenantId, dto.staffId),
    ]);
    const incentive = incentivesEnabled ? await this.resolveIncentive(tenantId, dto) : null;

    const active = componentViews.filter((c) => c.active);
    const bases = computeEarningsBases(
      basePay.earnedCents,
      incentive?.totalCents ?? 0,
      active.map((c) => ({ type: c.type, kind: c.kind, amountCents: c.amountCents, epfApplicable: c.epfApplicable, etfApplicable: c.etfApplicable })),
    );

    return {
      staffId: basePay.staffId,
      staffName: basePay.staffName,
      from: basePay.from,
      to: basePay.to,
      basePay,
      incentive,
      payComponents: active,
      allowancesCents: bases.allowancesCents,
      deductionsCents: bases.deductionsCents,
      epfApplicableEarningsCents: bases.epfApplicableEarningsCents,
      etfApplicableEarningsCents: bases.etfApplicableEarningsCents,
      totalCents: bases.grossCents,
    };
  }

  /**
   * A frozen payout already run for this exact period is the settled
   * figure; short of that, a live estimate — the same figure
   * `GET /incentive-plans/preview` would show — stands in, clearly labelled
   * as unfinalized rather than presented as if it were final.
   */
  private async resolveIncentive(tenantId: string, dto: BasePayPreviewQueryDto): Promise<PayrollIncentiveComponent | null> {
    const finalised = await this.payouts.findOne({
      where: { tenantId, staffId: dto.staffId, periodStart: dto.from, periodEnd: dto.to, status: Not(IncentivePayoutStatus.VOID) },
    });
    if (finalised) {
      return { source: "FINALIZED_PAYOUT", totalCents: finalised.totalCents, payoutId: finalised.id };
    }

    const earnings = await this.incentives.earningsFor(tenantId, dto.staffId, { from: dto.from, to: dto.to });
    if (!earnings) {
      return null;
    }
    return { source: "LIVE_ESTIMATE", totalCents: earnings.breakdown.totalCents, payoutId: null };
  }
}
