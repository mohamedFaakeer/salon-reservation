import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaginationQueryDto, ProvisionTenantDto } from "@salon/shared";
import type { AuthenticatedRequest } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// SuperAdminService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SuperAdminService } from "./super-admin.service";

/** API.md §4 — platform routes, SUPER_ADMIN only. */
@ApiTags("super-admin")
@ApiBearerAuth()
@Controller("super-admin/tenants")
export class SuperAdminController {
  constructor(private readonly superAdmin: SuperAdminService) {}

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
}
