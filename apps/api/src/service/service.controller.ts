import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateServiceDto, UpdateServiceDto } from "@salon/shared";
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
    return this.services.create(ctx.tenantId, dto);
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
    return this.services.update(ctx.tenantId, id, dto, {
      userId: ctx.userId,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
  }
}
