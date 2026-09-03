import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// BasePayPreviewQueryDto must stay a VALUE import: ValidationPipe resolves it
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BasePayPreviewQueryDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// PayrollPreviewService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollPreviewService } from "./payroll-preview.service";

/** The real payroll-run figure: base pay plus this period's commission. OWNER, MANAGER only. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/preview")
@RequiresModule("payroll")
export class PayrollPreviewController {
  constructor(private readonly payrollPreview: PayrollPreviewService) {}

  @Get()
  @Permissions(Permission.MANAGE_PAYROLL)
  preview(@Req() req: Request, @Query() query: BasePayPreviewQueryDto) {
    const ctx = getTenantContext(req);
    // A tenant without Incentives included never gets a commission component
    // here, whatever payroll-only data might technically exist for them.
    const incentivesEnabled = ctx.modules?.incentives ?? false;
    return this.payrollPreview.preview(ctx.tenantId, query, incentivesEnabled);
  }
}
