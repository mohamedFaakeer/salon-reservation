import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AttendanceEditRequestQueryDto,
  CreateAttendanceEditRequestDto,
  DecideAttendanceEditRequestDto,
} from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// AttendanceEditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AttendanceEditService } from "./attendance-edit.service";

/**
 * Corrections to a punch that was missed or mistaken. Filing is the same
 * self-or-front-desk split as the punches themselves; deciding is narrower —
 * VIEW/APPROVE_ATTENDANCE_EDIT, owner and manager only.
 */
@ApiTags("attendance")
@ApiBearerAuth()
@Controller("attendance/edit-requests")
export class AttendanceEditController {
  constructor(private readonly edits: AttendanceEditService) {}

  @Post()
  @Permissions(Permission.RECORD_ATTENDANCE, Permission.RECORD_OWN_ATTENDANCE)
  create(@Req() req: Request, @Body() dto: CreateAttendanceEditRequestDto) {
    const ctx = getTenantContext(req);
    return this.edits.request(ctx.tenantId, ctx, dto);
  }

  /** The manager's queue. */
  @Get()
  @Permissions(Permission.APPROVE_ATTENDANCE_EDIT)
  list(@Req() req: Request, @Query() query: AttendanceEditRequestQueryDto) {
    const ctx = getTenantContext(req);
    return this.edits.list(ctx.tenantId, query);
  }

  /** A stylist's own requests and their outcomes. */
  @Get("me")
  @Permissions(Permission.RECORD_OWN_ATTENDANCE, Permission.APPROVE_ATTENDANCE_EDIT)
  own(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.edits.own(ctx.tenantId, ctx.userId);
  }

  @Patch(":id")
  @Permissions(Permission.APPROVE_ATTENDANCE_EDIT)
  decide(@Req() req: Request, @Param("id") id: string, @Body() dto: DecideAttendanceEditRequestDto) {
    const ctx = getTenantContext(req);
    return this.edits.decide(ctx.tenantId, ctx, id, dto);
  }

  @Delete(":id")
  @Permissions(Permission.RECORD_ATTENDANCE, Permission.RECORD_OWN_ATTENDANCE)
  async withdraw(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    await this.edits.withdraw(ctx.tenantId, ctx, id);
    return { withdrawn: true };
  }
}
