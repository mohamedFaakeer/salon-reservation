import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// PayrollReportQueryDto must stay a VALUE import: ValidationPipe resolves it
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollReportQueryDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// PayrollReportService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollReportService } from "./payroll-report.service";

/** A cost breakdown for manual entry into whatever accounting software the salon uses — no GL exists to post into. OWNER, MANAGER only. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/reports")
@RequiresModule("payroll")
export class PayrollReportController {
  constructor(private readonly reports: PayrollReportService) {}

  @Get()
  @Permissions(Permission.MANAGE_PAYROLL)
  summary(@Req() req: Request, @Query() query: PayrollReportQueryDto) {
    const ctx = getTenantContext(req);
    return this.reports.summary(ctx.tenantId, query.from, query.to);
  }
}
