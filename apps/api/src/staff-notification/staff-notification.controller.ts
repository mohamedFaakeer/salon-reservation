import { Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaginationQueryDto } from "@salon/shared";
import { getTenantContext, type AuthenticatedRequest } from "../tenant/tenant-context";
// StaffNotificationService must stay a VALUE import: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime; `import
// type` would erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StaffNotificationService } from "./staff-notification.service";

/**
 * The notification bell — every role that can be logged into the admin app
 * gets it (no `@Permissions` gate beyond being authenticated for this
 * tenant), since "a customer booked/cancelled/rescheduled online" is
 * operationally relevant to owner, manager, and receptionist alike.
 */
@ApiTags("staff-notifications")
@ApiBearerAuth()
@Controller("notifications/staff")
export class StaffNotificationController {
  constructor(private readonly notifications: StaffNotificationService) {}

  @Get("unread-count")
  unreadStatus(@Req() req: AuthenticatedRequest) {
    const ctx = getTenantContext(req);
    return this.notifications.unreadStatus(ctx.tenantId, req.user.sub);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: PaginationQueryDto) {
    const ctx = getTenantContext(req);
    return this.notifications.list(ctx.tenantId, req.user.sub, query);
  }

  @Post(":id/read")
  markRead(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.markRead(ctx.tenantId, req.user.sub, id);
  }

  @Post("read-all")
  markAllRead(@Req() req: AuthenticatedRequest) {
    const ctx = getTenantContext(req);
    return this.notifications.markAllRead(ctx.tenantId, req.user.sub);
  }
}
