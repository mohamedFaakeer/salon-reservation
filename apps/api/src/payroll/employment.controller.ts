import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// UpsertEmploymentDto must stay a VALUE import: ValidationPipe resolves it via
// design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpsertEmploymentDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// EmploymentService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmploymentService } from "./employment.service";

/** Employment/payroll profiles — who earns what, and how. OWNER, MANAGER only; this is payroll. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/employment")
@RequiresModule("payroll")
export class EmploymentController {
  constructor(private readonly employment: EmploymentService) {}

  @Get()
  @Permissions(Permission.MANAGE_PAYROLL)
  listCurrent(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.employment.listCurrent(ctx.tenantId);
  }

  @Get(":staffId")
  @Permissions(Permission.MANAGE_PAYROLL)
  history(@Req() req: Request, @Param("staffId") staffId: string) {
    const ctx = getTenantContext(req);
    return this.employment.history(ctx.tenantId, staffId);
  }

  /**
   * Sets (or, if one is already open, supersedes) a staff member's pay
   * details. Same route and payload for both — `EmploymentService.upsert`
   * decides which it is from whether an open version already exists.
   */
  @Post(":staffId")
  @Permissions(Permission.MANAGE_PAYROLL)
  upsert(@Req() req: Request, @Param("staffId") staffId: string, @Body() dto: UpsertEmploymentDto) {
    const ctx = getTenantContext(req);
    return this.employment.upsert(ctx.tenantId, staffId, dto, ctx.userId);
  }
}
