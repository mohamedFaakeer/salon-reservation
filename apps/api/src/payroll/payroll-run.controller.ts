import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollRunQueryDto, RunPayrollDto, VoidPayrollRunDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// PayrollRunService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayrollRunService } from "./payroll-run.service";

/** Submitting, approving, paying, and voiding a payroll run. OWNER, MANAGER only — this is payroll. */
@ApiTags("payroll")
@ApiBearerAuth()
@Controller("payroll/runs")
@RequiresModule("payroll")
export class PayrollRunController {
  constructor(private readonly payrollRuns: PayrollRunService) {}

  @Get()
  @Permissions(Permission.MANAGE_PAYROLL)
  list(@Req() req: Request, @Query() query: PayrollRunQueryDto) {
    const ctx = getTenantContext(req);
    return this.payrollRuns.list(ctx.tenantId, query);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_PAYROLL)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.payrollRuns.get(ctx.tenantId, id);
  }

  @Post()
  @Permissions(Permission.MANAGE_PAYROLL)
  run(@Req() req: Request, @Body() dto: RunPayrollDto) {
    const ctx = getTenantContext(req);
    const incentivesEnabled = ctx.modules?.incentives ?? false;
    return this.payrollRuns.run(ctx.tenantId, dto, ctx.userId, incentivesEnabled);
  }

  @Patch(":id/approve")
  @Permissions(Permission.MANAGE_PAYROLL)
  approve(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.payrollRuns.approve(ctx.tenantId, id, ctx.userId);
  }

  @Patch(":id/paid")
  @Permissions(Permission.MANAGE_PAYROLL)
  markPaid(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.payrollRuns.markPaid(ctx.tenantId, id, ctx.userId);
  }

  @Patch(":id/void")
  @Permissions(Permission.MANAGE_PAYROLL)
  void(@Req() req: Request, @Param("id") id: string, @Body() dto: VoidPayrollRunDto) {
    const ctx = getTenantContext(req);
    return this.payrollRuns.void(ctx.tenantId, id, ctx.userId, dto.reason);
  }
}
