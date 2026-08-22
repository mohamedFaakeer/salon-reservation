import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaginationQueryDto, ProvisionTenantDto, UpdateTenantEntitlementsDto } from "@salon/shared";
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

/** API.md §4 — platform routes, SUPER_ADMIN only. */
@ApiTags("super-admin")
@ApiBearerAuth()
@Controller("super-admin/tenants")
export class SuperAdminController {
  constructor(
    private readonly superAdmin: SuperAdminService,
    private readonly demoSeedService: DemoSeedService,
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
}
