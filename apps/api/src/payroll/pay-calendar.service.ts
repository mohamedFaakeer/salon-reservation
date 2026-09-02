import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import type { UpsertPayCalendarDto } from "@salon/shared";
import { PayCalendar } from "../entities/pay-calendar.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import type { PayCalendarConfig } from "./payroll.domain";

const DEFAULT_MONTHLY_ANCHOR_DAY = 1;

@Injectable()
export class PayCalendarService {
  constructor(
    @InjectRepository(PayCalendar) private readonly calendars: Repository<PayCalendar>,
    private readonly audit: AuditService,
  ) {}

  /** A tenant with no row configured gets the ordinary calendar-month default — no row needs to exist for every tenant up front. */
  async resolve(tenantId: string): Promise<PayCalendarConfig> {
    const row = await this.calendars.findOne({ where: { tenantId } });
    return { monthlyAnchorDay: row?.monthlyAnchorDay ?? DEFAULT_MONTHLY_ANCHOR_DAY };
  }

  async upsertMonthly(tenantId: string, dto: UpsertPayCalendarDto, actorUserId: string): Promise<PayCalendarConfig> {
    const anchor = dto.monthlyAnchorDay ?? DEFAULT_MONTHLY_ANCHOR_DAY;
    const existing = await this.calendars.findOne({ where: { tenantId } });
    if (existing) {
      existing.monthlyAnchorDay = anchor;
      await this.calendars.save(existing);
    } else {
      await this.calendars.save(this.calendars.create({ tenantId, monthlyAnchorDay: anchor }));
    }

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PAYROLL_CALENDAR_UPDATED",
      entityType: "PayCalendar",
      entityId: tenantId,
      metadata: { monthlyAnchorDay: anchor },
    });

    return { monthlyAnchorDay: anchor };
  }
}
