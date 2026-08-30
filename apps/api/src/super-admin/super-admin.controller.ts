import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  DeactivateTenantDto,
  PaginationQueryDto,
  ProvisionTenantDto,
  UpdateTenantEntitlementsDto,
  UpdateTenantVisibilityDto,
} from "@salon/shared";
import type { AuthenticatedRequest } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// SuperAdminService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SuperAdminService } from "./super-admin.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DemoSeedService } from "./demo-seed.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantOffboardingService } from "./tenant-offboarding.service";

/** API.md §4 — platform routes, SUPER_ADMIN only. */
@ApiTags("super-admin")
@ApiBearerAuth()
@Controller("super-admin/tenants")
export class SuperAdminController {
  constructor(
    private readonly superAdmin: SuperAdminService,
    private readonly demoSeedService: DemoSeedService,
    private readonly offboarding: TenantOffboardingService,
  ) {}

  @Post()
  @Permissions(Permission.PLATFORM_ADMIN)
  provision(@Req() req: AuthenticatedRequest, @Body() dto: ProvisionTenantDto) {
    return this.superAdmin.provisionTenant(dto, req.user.sub);
  }

  @Get()
  @Permissions(Permission.PLATFORM_ADMIN)
  list(@Query() query: PaginationQueryDto) {
    return this.superAdmin.listTenants(query);
  }

  /**
   * DEPLOYMENT.md §7 — fills a freshly provisioned tenant with the demo
   * catalogue, staff, schedules, customers and sample appointments. Idempotent:
   * a second call reports `seeded: false` and changes nothing.
   */
  @Post(":tenantId/demo-seed")
  @Permissions(Permission.PLATFORM_ADMIN)
  demoSeed(@Req() req: AuthenticatedRequest, @Param("tenantId", ParseUUIDPipe) tenantId: string) {
    return this.demoSeedService.seed(tenantId, req.user.sub);
  }

  @Get(":tenantId/entitlements")
  @Permissions(Permission.PLATFORM_ADMIN)
  getEntitlements(@Param("tenantId", ParseUUIDPipe) tenantId: string) {
    return this.superAdmin.getEntitlements(tenantId);
  }

  @Patch(":tenantId/entitlements")
  @Permissions(Permission.PLATFORM_ADMIN)
  updateEntitlements(
    @Req() req: AuthenticatedRequest,
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantEntitlementsDto,
  ) {
    return this.superAdmin.updateEntitlements(tenantId, dto, req.user.sub);
  }

  /** Activate/deactivate a salon's customer-facing visibility (DECISIONS.md) — never affects staff/admin login. */
  @Patch(":tenantId/customer-visibility")
  @Permissions(Permission.PLATFORM_ADMIN)
  setCustomerVisibility(
    @Req() req: AuthenticatedRequest,
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantVisibilityDto,
  ) {
    return this.superAdmin.setCustomerVisibility(tenantId, dto, req.user.sub);
  }

  /**
   * Salon offboarding (DECISIONS.md): deactivate now (reversible, blocks
   * staff login + customer booking), retain data 90 days, then purge.
   */
  @Post(":tenantId/deactivate")
  @Permissions(Permission.PLATFORM_ADMIN)
  deactivate(
    @Req() req: AuthenticatedRequest,
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() dto: DeactivateTenantDto,
  ) {
    return this.offboarding.deactivate(tenantId, dto.reason, req.user.sub);
  }

  /** Reverses `deactivate` — only possible before the salon's data has actually been purged. */
  @Post(":tenantId/reactivate")
  @Permissions(Permission.PLATFORM_ADMIN)
  reactivate(@Req() req: AuthenticatedRequest, @Param("tenantId", ParseUUIDPipe) tenantId: string) {
    return this.offboarding.reactivate(tenantId, req.user.sub);
  }

  /**
   * Skips the 90-day retention window for a legitimate immediate-erasure
   * request. The confirmation step this needs lives client-side (the admin
   * UI requires typing the salon's name); this call is itself the confirmed
   * action, so it takes no body.
   */
  @Post(":tenantId/purge")
  @Permissions(Permission.PLATFORM_ADMIN)
  purgeNow(@Req() req: AuthenticatedRequest, @Param("tenantId", ParseUUIDPipe) tenantId: string) {
    return this.offboarding.purgeNow(tenantId, req.user.sub);
  }

  /**
   * The one path that can reset an OWNER's own password — a locked-out
   * OWNER has nobody within their salon who outranks them
   * (`TeamController`'s equivalent explicitly refuses an OWNER target).
   * Also usable on any non-owner login in the salon, same as the
   * tenant-scoped route (account-lockout-v2, DECISIONS.md).
   */
  @Post(":tenantId/team/:userId/reset-password")
  @Permissions(Permission.PLATFORM_ADMIN)
  resetTeamMemberPassword(
    @Req() req: AuthenticatedRequest,
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.superAdmin.resetTeamMemberPassword(tenantId, userId, req.user.sub);
  }
}
