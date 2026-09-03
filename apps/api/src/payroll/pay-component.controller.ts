import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// UpsertPayComponentDto must stay a VALUE import: ValidationPipe resolves it
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpsertPayComponentDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// PayComponentService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayComponentService } from "./pay-component.service";

/** Recurring allowances and deductions, from the fixed list. OWNER, MANAGER only — this is payroll. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/pay-components")
@RequiresModule("payroll")
export class PayComponentController {
  constructor(private readonly payComponents: PayComponentService) {}

  @Get()
  @Permissions(Permission.MANAGE_PAYROLL)
  list(@Req() req: Request, @Query("staffId") staffId?: string) {
    const ctx = getTenantContext(req);
    return this.payComponents.list(ctx.tenantId, staffId);
  }

  /** Assigns a component, replacing any existing active one of the same type for this staff member. */
  @Post(":staffId")
  @Permissions(Permission.MANAGE_PAYROLL)
  upsert(@Req() req: Request, @Param("staffId") staffId: string, @Body() dto: UpsertPayComponentDto) {
    const ctx = getTenantContext(req);
    return this.payComponents.upsert(ctx.tenantId, staffId, dto, ctx.userId);
  }

  @Delete(":id")
  @Permissions(Permission.MANAGE_PAYROLL)
  deactivate(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.payComponents.deactivate(ctx.tenantId, id, ctx.userId);
  }
}
