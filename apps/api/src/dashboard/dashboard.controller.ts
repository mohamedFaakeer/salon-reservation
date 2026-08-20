import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DashboardQueryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// DashboardService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DashboardService } from "./dashboard.service";

/** API.md §3 "Dashboard". */
@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Totals for a date range, defaulting to today. `live` is present only when
   * the range covers today.
   */
  @Get()
  @Permissions(Permission.VIEW_DASHBOARD)
  summary(@Req() req: Request, @Query() query: DashboardQueryDto) {
    const ctx = getTenantContext(req);
    return this.dashboard.summary(ctx.tenantId, query.from, query.to);
  }

  /** The original today-only shape. Kept so existing callers are unaffected. */
  @Get("today")
  @Permissions(Permission.VIEW_DASHBOARD)
  today(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.dashboard.today(ctx.tenantId);
  }
}
