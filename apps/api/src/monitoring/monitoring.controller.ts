import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  MonitoringErrorQueryDto,
  MonitoringSecurityEventQueryDto,
  PaginationQueryDto,
  UpdateMonitoringStatusDto,
} from "@salon/shared";
import type { AuthenticatedRequest } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// MonitoringService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MonitoringService } from "./monitoring.service";

/**
 * Platform-wide usage, error, and security monitoring — SUPER_ADMIN only.
 * See DECISIONS.md's monitoring entry for the full design (why AuditLog is
 * reused for security events, why severity is computed rather than stored).
 */
@ApiTags("super-admin-monitoring")
@ApiBearerAuth()
@Controller("super-admin/monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get("overview")
  @Permissions(Permission.PLATFORM_ADMIN)
  overview() {
    return this.monitoring.overview();
  }

  @Get("tenants")
  @Permissions(Permission.PLATFORM_ADMIN)
  tenantUsage(@Query() query: PaginationQueryDto) {
    return this.monitoring.tenantUsage(query);
  }

  @Get("service-status")
  @Permissions(Permission.PLATFORM_ADMIN)
  serviceStatus() {
    return this.monitoring.serviceStatus();
  }

  @Get("errors")
  @Permissions(Permission.PLATFORM_ADMIN)
  listErrors(@Query() query: MonitoringErrorQueryDto) {
    return this.monitoring.listErrors(query);
  }

  @Patch("errors/:id/status")
  @Permissions(Permission.PLATFORM_ADMIN)
  updateErrorStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMonitoringStatusDto) {
    return this.monitoring.updateErrorStatus(id, dto.status);
  }

  @Get("security-events")
  @Permissions(Permission.PLATFORM_ADMIN)
  listSecurityEvents(@Query() query: MonitoringSecurityEventQueryDto) {
    return this.monitoring.listSecurityEvents(query);
  }

  @Patch("security-events/:id/status")
  @Permissions(Permission.PLATFORM_ADMIN)
  updateSecurityEventStatus(
    @Req() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMonitoringStatusDto,
  ) {
    return this.monitoring.updateSecurityEventStatus(id, dto.status, req.user.sub);
  }
}
