import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// AttendancePunchDto and AttendanceQueryDto must stay VALUE imports:
// ValidationPipe resolves them via design:paramtypes metadata at runtime;
// `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AttendancePunchDto, AttendanceQueryDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// AttendanceService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AttendanceService } from "./attendance.service";

/**
 * Two audiences share this controller: the front desk punching whoever walks
 * in, and a stylist punching themselves from their own phone. Both routes are
 * gated by either permission — RolesGuard matches any listed one — and the
 * service decides what a caller may actually name (DATABASE.md-adjacent rule
 * in attendance.service.ts's resolveTarget).
 */
@ApiTags("attendance")
@ApiBearerAuth()
@Controller("attendance")
@RequiresModule("attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post("check-in")
  @Permissions(Permission.RECORD_ATTENDANCE, Permission.RECORD_OWN_ATTENDANCE)
  checkIn(@Req() req: Request, @Body() dto: AttendancePunchDto) {
    const ctx = getTenantContext(req);
    return this.attendance.checkIn(ctx.tenantId, ctx, dto.staffId);
  }

  @Post("check-out")
  @Permissions(Permission.RECORD_ATTENDANCE, Permission.RECORD_OWN_ATTENDANCE)
  checkOut(@Req() req: Request, @Body() dto: AttendancePunchDto) {
    const ctx = getTenantContext(req);
    return this.attendance.checkOut(ctx.tenantId, ctx, dto.staffId);
  }

  /** Everyone, for one day — the front desk's board. Defaults to today. */
  @Get("board")
  @Permissions(Permission.RECORD_ATTENDANCE, Permission.VIEW_ATTENDANCE)
  board(@Req() req: Request, @Query("date") date?: string) {
    const ctx = getTenantContext(req);
    return this.attendance.board(ctx.tenantId, date);
  }

  /** A range across everyone — the history screen. OWNER/MANAGER only. */
  @Get()
  @Permissions(Permission.VIEW_ATTENDANCE)
  report(@Req() req: Request, @Query() query: AttendanceQueryDto) {
    const ctx = getTenantContext(req);
    return this.attendance.report(ctx.tenantId, query);
  }

  /**
   * A stylist's own history. VIEW_OWN_SCHEDULE rather than VIEW_ATTENDANCE —
   * a staff member may see their own record without holding the permission
   * that unlocks everyone else's.
   */
  @Get("me")
  @Permissions(Permission.VIEW_OWN_SCHEDULE, Permission.VIEW_ATTENDANCE)
  async own(@Req() req: Request, @Query() query: AttendanceQueryDto) {
    const ctx = getTenantContext(req);
    const staffId = await this.attendance.ownStaffId(ctx.tenantId, ctx.userId);
    return this.attendance.report(ctx.tenantId, query, staffId);
  }

  /** One person's history — used by a manager drilling into a stylist's card. */
  @Get("staff/:staffId")
  @Permissions(Permission.VIEW_ATTENDANCE)
  forStaff(@Req() req: Request, @Param("staffId") staffId: string, @Query() query: AttendanceQueryDto) {
    const ctx = getTenantContext(req);
    return this.attendance.report(ctx.tenantId, query, staffId);
  }
}
