import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateStaffLeaveDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// StaffLeaveService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StaffLeaveService } from "./staff-leave.service";

/** API.md §3 "Schedules & Leave & Closures" — OWNER, MANAGER only for writes. */
@ApiTags("staff-leave")
@ApiBearerAuth()
@Controller("staff/:staffId/leave")
export class StaffLeaveController {
  constructor(private readonly leave: StaffLeaveService) {}

  @Post()
  @Permissions(Permission.MANAGE_STAFF)
  create(
    @Req() req: Request,
    @Param("staffId") staffId: string,
    @Body() dto: CreateStaffLeaveDto,
  ) {
    const ctx = getTenantContext(req);
    return this.leave.create(ctx.tenantId, staffId, dto, ctx.userId);
  }

  @Get()
  list(@Req() req: Request, @Param("staffId") staffId: string) {
    const ctx = getTenantContext(req);
    return this.leave.list(ctx.tenantId, staffId);
  }

  @Delete(":leaveId")
  @Permissions(Permission.MANAGE_STAFF)
  async remove(
    @Req() req: Request,
    @Param("staffId") staffId: string,
    @Param("leaveId") leaveId: string,
  ) {
    const ctx = getTenantContext(req);
    await this.leave.remove(ctx.tenantId, staffId, leaveId);
    return { ok: true };
  }
}
