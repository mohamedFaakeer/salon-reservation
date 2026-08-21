import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// IncentivePreviewQueryDto and UpsertIncentivePlanDto must stay VALUE
// imports: ValidationPipe resolves them via design:paramtypes metadata at
// runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentivePreviewQueryDto, UpsertIncentivePlanDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// IncentiveService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IncentiveService } from "./incentive.service";

/** Plan configuration and the live preview. OWNER, MANAGER only — this is payroll. */
@ApiTags("incentives")
@ApiBearerAuth()
@Controller("incentive-plans")
export class IncentiveController {
  constructor(private readonly incentives: IncentiveService) {}

  @Get()
  @Permissions(Permission.MANAGE_INCENTIVES)
  list(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.incentives.list(ctx.tenantId);
  }

  /**
   * Declared before `:id` so "preview" is never captured as a plan id.
   */
  @Get("preview")
  @Permissions(Permission.MANAGE_INCENTIVES)
  preview(@Req() req: Request, @Query() query: IncentivePreviewQueryDto) {
    const ctx = getTenantContext(req);
    return this.incentives.preview(ctx.tenantId, query);
  }

  /**
   * A stylist's own live estimate for the range they ask for. Any `staffId`
   * on the query is ignored — the caller's own staff row is the only one this
   * permission can ever name. VIEW_OWN_INCENTIVE_EARNINGS rather than
   * MANAGE_INCENTIVES: reading your own running figure is not payroll access.
   */
  @Get("me/preview")
  @Permissions(Permission.VIEW_OWN_INCENTIVE_EARNINGS)
  async previewOwn(@Req() req: Request, @Query() query: IncentivePreviewQueryDto) {
    const ctx = getTenantContext(req);
    const staffId = await this.incentives.ownStaffId(ctx.tenantId, ctx.userId);
    const rows = await this.incentives.preview(ctx.tenantId, { ...query, staffId });
    return rows[0] ?? null;
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_INCENTIVES)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.incentives.get(ctx.tenantId, id);
  }

  @Post()
  @Permissions(Permission.MANAGE_INCENTIVES)
  create(@Req() req: Request, @Body() dto: UpsertIncentivePlanDto) {
    const ctx = getTenantContext(req);
    return this.incentives.create(ctx.tenantId, dto);
  }

  @Put(":id")
  @Permissions(Permission.MANAGE_INCENTIVES)
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpsertIncentivePlanDto) {
    const ctx = getTenantContext(req);
    return this.incentives.update(ctx.tenantId, id, dto);
  }
}
