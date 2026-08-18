import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
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

  /**
   * What a leave over this range would collide with, without creating it.
   *
   * Declared before the parameterised routes so "affected" is never captured
   * as a `:leaveId`. Read-only, so it needs no MANAGE_STAFF write permission
   * beyond the tenant guard every route already carries.
   */
  @Get("affected")
  affected(
    @Req() req: Request,
    @Param("staffId") staffId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    const ctx = getTenantContext(req);
    return this.leave.findAffected(ctx.tenantId, staffId, startDate, endDate);
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
