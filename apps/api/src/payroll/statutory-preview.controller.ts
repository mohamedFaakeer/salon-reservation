import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// BasePayPreviewQueryDto must stay a VALUE import: ValidationPipe resolves
// it via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BasePayPreviewQueryDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// StatutoryPreviewService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StatutoryPreviewService } from "./statutory-preview.service";

/** EPF/ETF/APIT for one staff member, one full calendar month. OWNER, MANAGER only. Refused unless this tenant's statutory calculations are enabled. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/statutory")
@RequiresModule("payroll")
export class StatutoryPreviewController {
  constructor(private readonly statutoryPreview: StatutoryPreviewService) {}

  @Get("preview")
  @Permissions(Permission.MANAGE_PAYROLL)
  preview(@Req() req: Request, @Query() query: BasePayPreviewQueryDto) {
    const ctx = getTenantContext(req);
    const incentivesEnabled = ctx.modules?.incentives ?? false;
    return this.statutoryPreview.preview(ctx.tenantId, query, incentivesEnabled);
  }
}
