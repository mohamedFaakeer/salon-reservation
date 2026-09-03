import { Controller, Get, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// PayrollSettingsService must stay a VALUE import: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollSettingsService } from "./payroll-settings.service";

/** Read-only: the tenant's pay cycle and statutory-enablement status. Changing either happens elsewhere (pay-calendars for the cycle, a platform admin for statutory). */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/settings")
@RequiresModule("payroll")
export class PayrollSettingsController {
  constructor(private readonly settings: PayrollSettingsService) {}

  @Get()
  @Permissions(Permission.MANAGE_PAYROLL)
  get(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.settings.get(ctx.tenantId);
  }
}
