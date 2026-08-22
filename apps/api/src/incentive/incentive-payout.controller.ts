import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentivePayoutQueryDto, RunIncentivePayoutDto, VoidIncentivePayoutDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// IncentivePayoutService must stay a VALUE import: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentivePayoutService } from "./incentive-payout.service";
// IncentiveService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentiveService } from "./incentive.service";

/** Finalised payouts. OWNER, MANAGER only — this is payroll. */
@ApiTags("incentives")
@ApiBearerAuth()
@Controller("incentive-payouts")
@RequiresModule("incentives")
export class IncentivePayoutController {
  constructor(
    private readonly payouts: IncentivePayoutService,
    private readonly incentives: IncentiveService,
  ) {}

  @Get()
  @Permissions(Permission.MANAGE_INCENTIVES)
  list(@Req() req: Request, @Query() query: IncentivePayoutQueryDto) {
    const ctx = getTenantContext(req);
    return this.payouts.list(ctx.tenantId, query);
  }

  /**
   * A stylist's own payout history. Declared before `:id` so "me" is never
   * captured as a payout id. VIEW_OWN_INCENTIVE_EARNINGS, not MANAGE_INCENTIVES.
   */
  @Get("me")
  @Permissions(Permission.VIEW_OWN_INCENTIVE_EARNINGS)
  async own(@Req() req: Request) {
    const ctx = getTenantContext(req);
    const staffId = await this.incentives.ownStaffId(ctx.tenantId, ctx.userId);
    return this.payouts.own(ctx.tenantId, staffId);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_INCENTIVES)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.payouts.get(ctx.tenantId, id);
  }

  @Post()
  @Permissions(Permission.MANAGE_INCENTIVES)
  run(@Req() req: Request, @Body() dto: RunIncentivePayoutDto) {
    const ctx = getTenantContext(req);
    return this.payouts.run(ctx.tenantId, dto, ctx.userId);
  }

  @Patch(":id/paid")
  @Permissions(Permission.MANAGE_INCENTIVES)
  markPaid(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.payouts.markPaid(ctx.tenantId, id, ctx.userId);
  }

  @Patch(":id/void")
  @Permissions(Permission.MANAGE_INCENTIVES)
  void(@Req() req: Request, @Param("id") id: string, @Body() dto: VoidIncentivePayoutDto) {
    const ctx = getTenantContext(req);
    return this.payouts.void(ctx.tenantId, id, ctx.userId, dto.reason);
  }
}
