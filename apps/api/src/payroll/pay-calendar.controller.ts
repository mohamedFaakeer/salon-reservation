import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// UpsertPayCalendarDto must stay a VALUE import: ValidationPipe resolves it
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpsertPayCalendarDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// PayCalendarService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayCalendarService } from "./pay-calendar.service";

/** The tenant's monthly pay-period cycle. OWNER, MANAGER only. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/pay-calendars")
@RequiresModule("payroll")
export class PayCalendarController {
  constructor(private readonly calendars: PayCalendarService) {}

  @Get("monthly")
  @Permissions(Permission.MANAGE_PAYROLL)
  get(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.calendars.resolve(ctx.tenantId);
  }

  @Put("monthly")
  @Permissions(Permission.MANAGE_PAYROLL)
  update(@Req() req: Request, @Body() dto: UpsertPayCalendarDto) {
    const ctx = getTenantContext(req);
    return this.calendars.upsertMonthly(ctx.tenantId, dto, ctx.userId);
  }
}
