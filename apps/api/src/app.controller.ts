import { Controller, Get } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { ApiTags } from "@nestjs/swagger";
import { ApiError } from "@salon/shared";
import { Public } from "./common/decorators/public.decorator";

/**
 * Bounded well below Render's own health-check request timeout, so a slow
 * database reads as "down" to this check before Render's own probe would
 * time out waiting on us — the failure needs to surface here, not upstream.
 */
const HEALTH_DB_TIMEOUT_MS = 3_000;

@ApiTags("health")
@Controller()
export class AppController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * This is what Render polls to decide whether to keep the API alive
   * (docs/DEPLOYMENT.md). It used to be a static "ok" with no dependency
   * check at all, so a total database outage was invisible to it. A cheap
   * `SELECT 1`, bounded by its own timeout so a hung query can't hang this
   * endpoint too, closes that gap.
   */
  @Public()
  @Get("health")
  async health(): Promise<{ status: string; timestamp: string }> {
    try {
      await Promise.race([
        this.dataSource.query("SELECT 1"),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Database health check timed out")), HEALTH_DB_TIMEOUT_MS);
        }),
      ]);
    } catch {
      throw new ApiError({
        statusCode: 503,
        code: "DATABASE_UNAVAILABLE",
        message: "The database is unreachable right now.",
      });
    }

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
