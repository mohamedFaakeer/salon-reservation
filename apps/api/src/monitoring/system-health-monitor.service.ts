import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
// PlatformAlertService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PlatformAlertService } from "../alerting/platform-alert.service";

/** Bounded well under the cron interval, so one slow ping can't overlap the next. */
const DB_PING_TIMEOUT_MS = 5_000;

/**
 * Resilience-audit gap (docs/INFRASTRUCTURE_RESILIENCE_AUDIT.md §3.1,
 * §5): nothing previously watched for a live database outage — the only
 * two things that ever paged a human were a notification-quota threshold
 * and a HIGH/CRITICAL security event, neither of which is "something is
 * actually down." This pings the database on the same cadence as the
 * notification retry scheduler and reuses PlatformAlertService (already
 * built, already emails SUPER_ADMIN_EMAIL) rather than adding new alerting
 * infrastructure.
 *
 * Alerts only on a state *transition* (healthy -> unhealthy, and the
 * recovery back) — never once per tick while an outage is ongoing, which
 * would otherwise mean one email every two minutes for the duration of a
 * real incident.
 */
@Injectable()
export class SystemHealthMonitorService {
  private readonly logger = new Logger(SystemHealthMonitorService.name);
  private wasHealthy = true;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly alerts: PlatformAlertService,
  ) {}

  @Cron("*/2 * * * *")
  async checkDatabaseHealth(): Promise<void> {
    const healthy = await this.pingDatabase();

    if (!healthy && this.wasHealthy) {
      this.wasHealthy = false;
      await this.alerts.send(
        "Database unreachable",
        "The API's database health check has started failing. Every request that touches data is likely failing right now.",
      );
    } else if (healthy && !this.wasHealthy) {
      this.wasHealthy = true;
      await this.alerts.send(
        "Database reachable again",
        "The API's database health check is passing again after an earlier failure.",
      );
    }
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await Promise.race([
        this.dataSource.query("SELECT 1"),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Database health ping timed out")), DB_PING_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (err) {
      this.logger.warn(`Database health ping failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
