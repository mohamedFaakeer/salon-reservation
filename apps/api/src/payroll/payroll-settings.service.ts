import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { Tenant } from "../entities/tenant.entity";
// PayCalendarService and StatutoryRuleSetService must stay VALUE imports:
// NestJS resolves constructor injection via design:paramtypes metadata at
// runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayCalendarService } from "./pay-calendar.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StatutoryRuleSetService } from "./statutory-rule-set.service";
import type { PayrollSettingsView } from "./payroll-settings.types";

/**
 * One read assembling everything the Payroll Settings screen needs — the
 * same "one endpoint, one round trip" shape `ReportsService.summary`
 * already uses, rather than the screen making three separate calls.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly payCalendar: PayCalendarService,
    private readonly ruleSets: StatutoryRuleSetService,
  ) {}

  async get(tenantId: string): Promise<PayrollSettingsView> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    const enabled = tenant?.statutoryPayrollEnabled ?? false;

    // A tenant not enabled for statutory calculations never sees the
    // platform's rate table — there's nothing for them to act on, and the
    // rates are the platform's own configuration, not theirs to browse.
    const ruleSet = enabled ? await this.ruleSets.current() : null;

    return {
      payCalendar: await this.payCalendar.resolve(tenantId),
      statutoryPayrollEnabled: enabled,
      statutoryRuleSet: ruleSet
        ? {
            epfEmployeePercent: ruleSet.epfEmployeePercent,
            epfEmployerPercent: ruleSet.epfEmployerPercent,
            etfEmployerPercent: ruleSet.etfEmployerPercent,
            apitMonthlyFreeThresholdCents: ruleSet.apitMonthlyFreeThresholdCents,
            verified: ruleSet.verified,
          }
        : null,
    };
  }
}
