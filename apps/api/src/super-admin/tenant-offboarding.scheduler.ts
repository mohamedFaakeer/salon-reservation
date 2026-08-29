import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
// TenantOffboardingService must stay a VALUE import: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime; `import
// type` would erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantOffboardingService } from "./tenant-offboarding.service";

/**
 * The 90-day retention sweep (salon-offboarding). Off-peak, once a day —
 * unlike the notification retry scanner this fires on, purges are rare and
 * never time-sensitive to the minute, so there is no cost to batching them
 * into one quiet window.
 */
@Injectable()
export class TenantOffboardingScheduler {
  private readonly logger = new Logger(TenantOffboardingScheduler.name);

  constructor(private readonly offboarding: TenantOffboardingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleScheduledPurge(): Promise<void> {
    try {
      const { purgedTenantIds } = await this.offboarding.runScheduledPurge();
      if (purgedTenantIds.length > 0) {
        this.logger.log(`Scheduled purge ran: ${purgedTenantIds.length} tenant(s) anonymized.`);
      }
    } catch (err) {
      this.logger.error("Scheduled tenant purge sweep failed", err instanceof Error ? err.stack : err);
    }
  }
}
