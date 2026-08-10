import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateClosureDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// ClosureService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ClosureService } from "./closure.service";

/** API.md §3 "Schedules & Leave & Closures". Write = OWNER/MANAGER (MANAGE_STAFF bundles closures). */
@ApiTags("closures")
@ApiBearerAuth()
@Controller("closures")
export class ClosureController {
  constructor(private readonly closures: ClosureService) {}

  @Post()
  @Permissions(Permission.MANAGE_STAFF)
  create(@Req() req: Request, @Body() dto: CreateClosureDto) {
    const ctx = getTenantContext(req);
    return this.closures.create(ctx.tenantId, dto);
  }

  @Get()
  list(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.closures.list(ctx.tenantId);
  }

  @Delete(":id")
  @Permissions(Permission.MANAGE_STAFF)
  async remove(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    await this.closures.remove(ctx.tenantId, id);
    return { ok: true };
  }
}
