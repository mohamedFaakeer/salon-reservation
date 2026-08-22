import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateServiceDto, SetServiceDiscountDto, UpdateServiceDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// ServiceService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ServiceService } from "./service.service";

/** API.md §3 "Services & Staff" — write = OWNER/MANAGER, read = all. */
@ApiTags("services")
@ApiBearerAuth()
@Controller("services")
export class ServiceController {
  constructor(private readonly services: ServiceService) {}

  @Post()
  @Permissions(Permission.MANAGE_SERVICES)
  create(@Req() req: Request, @Body() dto: CreateServiceDto) {
    const ctx = getTenantContext(req);
    return this.services.create(ctx.tenantId, dto, ctx.limits?.maxServices ?? null);
  }

  @Get()
  list(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.services.list(ctx.tenantId);
  }

  @Patch(":id")
  @Permissions(Permission.MANAGE_SERVICES)
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateServiceDto) {
    const ctx = getTenantContext(req);
    return this.services.update(ctx.tenantId, id, dto, actorOf(req, ctx.userId));
  }

  /**
   * PUT, not PATCH: an offer is replaced wholesale. Amount, dates and hours
   * are one decision, and half-updating them produces states that mean
   * nothing.
   */
  @Put(":id/discount")
  @Permissions(Permission.MANAGE_SERVICES)
  setDiscount(@Req() req: Request, @Param("id") id: string, @Body() dto: SetServiceDiscountDto) {
    const ctx = getTenantContext(req);
    return this.services.setDiscount(ctx.tenantId, id, dto, actorOf(req, ctx.userId));
  }

  @Delete(":id/discount")
  @Permissions(Permission.MANAGE_SERVICES)
  removeDiscount(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.services.removeDiscount(ctx.tenantId, id, actorOf(req, ctx.userId));
  }
}

function actorOf(req: Request, userId: string) {
  return {
    userId,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}
