import { Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationQueryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "./notification.service";

/** API.md §3 "Notifications". */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  list(@Req() req: Request, @Query() query: NotificationQueryDto) {
    const ctx = getTenantContext(req);
    return this.notifications.list(ctx.tenantId, query);
  }

  @Post(":id/retry")
  @HttpCode(200)
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  retry(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.retry(ctx.tenantId, id);
  }
}
