import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ApiError } from "@salon/shared";
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
        logoUrl: tenant.settings.logoUrl ?? null,
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

  /**
   * A hard multer ceiling well above the real 1MB limit — just a backstop
   * against an enormous upload occupying memory before it's even read.
   * `TenantService.uploadLogo` runs the real, precisely-coded constraints
   * (size/type/dimensions/aspect ratio) and owns every rejection message.
   */
  @Post("me/logo")
  @Permissions(Permission.MANAGE_TENANT_SETTINGS)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5_000_000 } }))
  async uploadLogo(@Req() req: Request, @UploadedFile() file: Express.Multer.File | undefined) {
    const ctx = getTenantContext(req);
    if (!file) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "No file was uploaded." });
    }
    return this.tenants.uploadLogo(ctx.tenantId, file.buffer);
  }

  @Delete("me/logo")
  @Permissions(Permission.MANAGE_TENANT_SETTINGS)
  async removeLogo(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.tenants.removeLogo(ctx.tenantId);
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