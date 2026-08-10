import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// TenantService/BranchService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "./tenant.service";
import { getTenantContext } from "./tenant-context";
import type { TenantStatus } from "../enums/tenant-status.enum";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BranchService } from "../branch/branch.service";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BranchUpdateDto, TenantProfileUpdateDto, TenantSettingsUpdateDto } from "@salon/shared";

@ApiTags("tenant")
@ApiBearerAuth()
@Controller("tenant")
export class TenantController {
  constructor(
    private readonly tenants: TenantService,
    private readonly branches: BranchService,
  ) {}

  @Get("me")
  async getMe(@Req() req: Request) {
    const ctx = getTenantContext(req);
    const tenant = await this.tenants.findById(ctx.tenantId);
    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        currency: tenant.currency,
        timezone: tenant.timezone,
      },
      context: ctx,
    };
  }

  @Patch("me")
  @Permissions(Permission.MANAGE_TENANT_SETTINGS)
  async patchProfile(@Req() req: Request, @Body() patch: TenantProfileUpdateDto) {
    const ctx = getTenantContext(req);
    const tenant = await this.tenants.updateProfile(ctx.tenantId, patch);
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      currency: tenant.currency,
      timezone: tenant.timezone,
    };
  }

  @Get("me/settings")
  async getSettings(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.tenants.getSettings(ctx.tenantId);
  }

  @Patch("me/settings")
  @Permissions(Permission.MANAGE_TENANT_SETTINGS)
  async patchSettings(@Req() req: Request, @Body() patch: TenantSettingsUpdateDto) {
    const ctx = getTenantContext(req);
    return this.tenants.updateSettings(ctx.tenantId, patch);
  }

  @Get("me/branch")
  async getBranch(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.branches.getDefaultBranch(ctx.tenantId);
  }

  @Patch("me/branch")
  @Permissions(Permission.MANAGE_TENANT_SETTINGS)
  async patchBranch(@Req() req: Request, @Body() patch: BranchUpdateDto) {
    const ctx = getTenantContext(req);
    return this.branches.updateDefaultBranch(ctx.tenantId, patch);
  }

  @Patch(":id/status")
  @Permissions(Permission.PLATFORM_ADMIN)
  async setStatus(@Param("id") id: string, @Body("status") status: TenantStatus) {
    return this.tenants.setStatus(id, status);
  }
}