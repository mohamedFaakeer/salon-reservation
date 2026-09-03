import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, type BasePayPreviewQueryDto } from "@salon/shared";
import { Tenant } from "../entities/tenant.entity";
// PayrollPreviewService and StatutoryRuleSetService must stay VALUE imports:
// NestJS resolves constructor injection via design:paramtypes metadata at
// runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollPreviewService } from "./payroll-preview.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StatutoryRuleSetService } from "./statutory-rule-set.service";
import { computeApitForMonth, computeEpfEtf } from "./statutory.domain";
import type { StatutoryPreviewView } from "./statutory-preview.types";

@Injectable()
export class StatutoryPreviewService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly payrollPreview: PayrollPreviewService,
    private readonly ruleSets: StatutoryRuleSetService,
  ) {}

  /**
   * EPF/ETF (safe on any period, since both are flat percentages) plus APIT
   * (only meaningful for one whole calendar tax month — IRD's own Table 01
   * has no daily/weekly/fortnightly equivalent, DECISIONS.md §62) against
   * this tenant's gross for the period, computed from the same
   * `PayrollPreviewService` figure the payroll-run preview already shows.
   *
   * Gated twice, deliberately: `Tenant.statutoryPayrollEnabled` (a platform
   * admin's compliance sign-off, off by default for every tenant) and a
   * published `StatutoryRuleSet` actually existing. Neither gate is a
   * stand-in for the other.
   */
  async preview(tenantId: string, dto: BasePayPreviewQueryDto, incentivesEnabled: boolean): Promise<StatutoryPreviewView> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant?.statutoryPayrollEnabled) {
      throw new ApiError({
        statusCode: 403,
        code: "STATUTORY_PAYROLL_NOT_ENABLED",
        message:
          "Statutory calculations aren't enabled for this salon yet. They stay off until a qualified Sri Lankan payroll/accounting professional has reviewed the configuration.",
      });
    }

    assertFullCalendarMonth(dto.from, dto.to);

    const ruleSet = await this.ruleSets.current();
    if (!ruleSet) {
      throw new ApiError({
        statusCode: 409,
        code: "NO_STATUTORY_RULE_SET",
        message: "No statutory rule set has been published yet.",
      });
    }

    const gross = await this.payrollPreview.preview(tenantId, dto, incentivesEnabled);
    const epfEtf = computeEpfEtf(gross.totalCents, ruleSet);
    const apitCents = computeApitForMonth(gross.totalCents, ruleSet.apitMonthlyFreeThresholdCents, ruleSet.apitBands);

    return {
      staffId: gross.staffId,
      staffName: gross.staffName,
      from: gross.from,
      to: gross.to,
      grossCents: gross.totalCents,
      epfEmployeeCents: epfEtf.epfEmployeeCents,
      epfEmployerCents: epfEtf.epfEmployerCents,
      etfEmployerCents: epfEtf.etfEmployerCents,
      apitCents,
      netCents: gross.totalCents - epfEtf.epfEmployeeCents - apitCents,
      verified: ruleSet.verified,
      ruleSetId: ruleSet.id,
    };
  }
}

/** APIT is a monthly-only concept — refuse anything that isn't exactly one calendar month, rather than silently misapplying a monthly table to a partial figure. */
function assertFullCalendarMonth(from: string, to: string): void {
  const [year, month, day] = from.split("-").map(Number);
  if (day !== 1) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_STATUTORY_PERIOD",
      message: "APIT can only be calculated for one full calendar month at a time — 'from' must be the 1st of the month.",
    });
  }
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const expectedTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
  if (to !== expectedTo) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_STATUTORY_PERIOD",
      message: `APIT can only be calculated for one full calendar month at a time — 'to' must be ${expectedTo}.`,
    });
  }
}
