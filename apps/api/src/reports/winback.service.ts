import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { In, MoreThan, Repository } from "typeorm";
import { NotificationEvent, type SendWinbackCampaignDto } from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import { Notification } from "../entities/notification.entity";
import type { Tenant } from "../entities/tenant.entity";
// NotificationService/AuditService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime; `import
// type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "../notification/notification.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

/** A customer already sent a win-back message within this window is skipped — an accidental-double-send guard, not a scheduling system. */
const RECENTLY_CONTACTED_DAYS = 14;

export interface WinbackResult {
  sent: string[];
  skippedOptedOut: string[];
  skippedRecentlyContacted: string[];
}

/**
 * Turns the "Worth a call" report's lapsed-customer list into an actual
 * message. Deliberately a sibling of `ReportsService`, not a method on it —
 * the report stays read-only, this is the separate action built on top of
 * it. The audience is exactly the `customerIds` the caller sends (the report
 * already caps that list at 25); every recipient is re-loaded from the
 * database here, never trusted from the request body beyond their id.
 */
@Injectable()
export class WinbackService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly notificationService: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async send(tenant: Tenant, dto: SendWinbackCampaignDto, actorUserId: string): Promise<WinbackResult> {
    const rows = await this.customers.find({ where: { tenantId: tenant.id, id: In(dto.customerIds) } });
    const byId = new Map(rows.map((c) => [c.id, c]));

    const cutoff = new Date(Date.now() - RECENTLY_CONTACTED_DAYS * 24 * 60 * 60_000);

    const result: WinbackResult = { sent: [], skippedOptedOut: [], skippedRecentlyContacted: [] };

    for (const customerId of dto.customerIds) {
      const customer = byId.get(customerId);
      // An id that doesn't belong to this tenant (or doesn't exist) is
      // silently dropped rather than erroring the whole batch — the caller
      // only ever sends ids straight from their own report.
      if (!customer) {
        continue;
      }
      if (customer.marketingOptOut) {
        result.skippedOptedOut.push(customerId);
        continue;
      }
      const recentlyContacted = await this.notifications.findOne({
        where: {
          tenantId: tenant.id,
          customerId,
          type: NotificationEvent.WINBACK_OFFER,
          createdAt: MoreThan(cutoff),
        },
      });
      if (recentlyContacted) {
        result.skippedRecentlyContacted.push(customerId);
        continue;
      }

      const message = personalize(dto.message, customer.firstName, tenant.name, dto.giftCardCode);
      await this.notificationService.sendCampaignMessage(tenant, customer, message);
      await this.audit.record({
        tenantId: tenant.id,
        actorUserId,
        action: "WINBACK_CAMPAIGN_SENT",
        entityType: "Customer",
        entityId: customerId,
        metadata: { message, giftCardCode: dto.giftCardCode ?? null },
      });
      result.sent.push(customerId);
    }

    return result;
  }
}

function personalize(message: string, firstName: string, salonName: string, giftCardCode?: string): string {
  const substituted = message.replace(/\{firstName\}/g, firstName).replace(/\{salonName\}/g, salonName);
  if (!giftCardCode) {
    return substituted;
  }
  return `${substituted}\n\nUse code ${giftCardCode.trim().toUpperCase()} at checkout.`;
}
