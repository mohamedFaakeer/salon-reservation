import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
// NotificationService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "./notification.service";

/** The retry scheduler + reminder scanner (DEVELOPMENT_PLAN.md P15 deliverables). */
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

  @Cron("*/15 * * * *")
  async handleReminderScan(): Promise<void> {
    try {
      await this.notifications.runReminderScan();
    } catch (err) {
      this.logger.error("Reminder scan failed", err instanceof Error ? err.stack : err);
    }
  }
}
