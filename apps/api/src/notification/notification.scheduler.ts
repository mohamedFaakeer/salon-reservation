import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
// NotificationService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "./notification.service";

/**
 * The retry scheduler (DEVELOPMENT_PLAN.md P15 deliverable). The reminder
 * scan that used to live here was retired (DECISIONS.md §39): it fired a
 * hardcoded CONSOLE+EMAIL 24h/2h reminder unconditionally, completely
 * independent of the Notification Rules engine — once Rules could actually
 * send (they couldn't, until §39), the two would have double-sent every
 * reminder. `NotificationSchedulerService` (the Rules-based scanner) is now
 * the only reminder path, seeded with default 24h/2h Rules per tenant so
 * existing behavior carries over unchanged, but is now a real, editable Rule.
 */
@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(private readonly notifications: NotificationService) {}

  @Cron("*/1 * * * *")
  async handleScheduledRetries(): Promise<void> {
    try {
      await this.notifications.runScheduledRetries();
    } catch (err) {
      this.logger.error("Scheduled notification retry run failed", err instanceof Error ? err.stack : err);
    }
  }
}
