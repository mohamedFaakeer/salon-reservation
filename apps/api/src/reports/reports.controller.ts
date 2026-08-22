import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ReportQueryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// ReportsService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ReportsService } from "./reports.service";

/**
 * Reports — OWNER and MANAGER only, via VIEW_REPORTS.
 *
 * Not VIEW_DASHBOARD, which receptionists also hold: these figures include
 * salon revenue, a per-stylist league table and named customer spend.
 */
@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
@Permissions(Permission.VIEW_REPORTS)
@RequiresModule("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Every panel, for one date range, in one response. Defaults to today.
   *
   * A locked panel (Lite tenant, that panel not individually overridden on)
   * comes back `null` — the server never computes or sends its real numbers,
   * so there is nothing for a client to read even by inspecting the response.
   */
  @Get()
  summary(@Req() req: Request, @Query() query: ReportQueryDto) {
    const ctx = getTenantContext(req);
    return this.reports.summary(ctx.tenantId, query.from, query.to, ctx.reportPanels);
  }
}
