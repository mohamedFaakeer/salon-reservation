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
// BasePayService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BasePayService } from "./base-pay.service";

/** A live, unsaved base-pay figure — nothing here is a run or a payslip yet. OWNER, MANAGER only. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/base-pay")
@RequiresModule("payroll")
export class BasePayController {
  constructor(private readonly basePay: BasePayService) {}

  @Get("preview")
  @Permissions(Permission.MANAGE_PAYROLL)
  preview(@Req() req: Request, @Query() query: BasePayPreviewQueryDto) {
    const ctx = getTenantContext(req);
    return this.basePay.preview(ctx.tenantId, query);
  }
}
