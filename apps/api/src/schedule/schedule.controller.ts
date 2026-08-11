import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateWorkingScheduleDto, UpdateWorkingScheduleDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// ScheduleService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ScheduleService } from "./schedule.service";

/** API.md §3 "Schedules & Leave & Closures" — write = OWNER/MANAGER, read = all. */
@ApiTags("schedules")
@ApiBearerAuth()
@Controller("schedules")
export class ScheduleController {
  constructor(private readonly schedules: ScheduleService) {}

  @Post()
  @Permissions(Permission.MANAGE_STAFF)
  create(@Req() req: Request, @Body() dto: CreateWorkingScheduleDto) {
    const ctx = getTenantContext(req);
    return this.schedules.create(ctx.tenantId, dto, ctx.userId);
  }

  @Get()
  list(@Req() req: Request, @Query("staffId") staffId?: string) {
    const ctx = getTenantContext(req);
    return this.schedules.list(ctx.tenantId, staffId);
  }

  @Patch(":id")
  @Permissions(Permission.MANAGE_STAFF)
  update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: UpdateWorkingScheduleDto,
  ) {
    const ctx = getTenantContext(req);
    return this.schedules.update(ctx.tenantId, id, dto, ctx.userId);
  }

  @Delete(":id")
  @Permissions(Permission.MANAGE_STAFF)
  async remove(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    await this.schedules.remove(ctx.tenantId, id, ctx.userId);
    return { ok: true };
  }
}
