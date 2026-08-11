import { Body, Controller, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateStaffDto, SetStaffServicesDto, UpdateStaffDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// StaffService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StaffService } from "./staff.service";

/** API.md §3 "Services & Staff" — write = OWNER/MANAGER, read = all. */
@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  @Permissions(Permission.MANAGE_STAFF)
  create(@Req() req: Request, @Body() dto: CreateStaffDto) {
    const ctx = getTenantContext(req);
    return this.staff.create(ctx.tenantId, dto);
  }

  @Get()
  list(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.staff.list(ctx.tenantId);
  }

  @Patch(":id")
  @Permissions(Permission.MANAGE_STAFF)
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateStaffDto) {
    const ctx = getTenantContext(req);
    return this.staff.update(ctx.tenantId, id, dto);
  }

  @Get(":id/services")
  getServices(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.staff.getServices(ctx.tenantId, id);
  }

  @Put(":id/services")
  @Permissions(Permission.MANAGE_STAFF)
  setServices(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: SetStaffServicesDto,
  ) {
    const ctx = getTenantContext(req);
    return this.staff.setServices(ctx.tenantId, id, dto);
  }
}
