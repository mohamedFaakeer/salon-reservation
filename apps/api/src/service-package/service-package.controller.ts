import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiError } from "@salon/shared";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateServicePackageDto, ServicePackageQueryDto, VoidServicePackageDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// TenantService/ServicePackageService must stay VALUE imports: NestJS
// resolves constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ServicePackageService } from "./service-package.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Service packages (API.md) — creating/voiding is OWNER, MANAGER only. */
@ApiTags("service-packages")
@ApiBearerAuth()
@Controller("service-packages")
export class ServicePackageController {
  constructor(
    private readonly servicePackages: ServicePackageService,
    private readonly tenantService: TenantService,
  ) {}

  @Post()
  @Permissions(Permission.MANAGE_SERVICE_PACKAGES)
  async create(
    @Req() req: Request,
    @Body() dto: CreateServicePackageDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ctx = getTenantContext(req);
    const key = requireIdempotencyKey(idempotencyKey);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.servicePackages.create(tenant, dto, ctx.userId, key);
  }

  @Get()
  @Permissions(Permission.MANAGE_SERVICE_PACKAGES)
  list(@Req() req: Request, @Query() query: ServicePackageQueryDto) {
    const ctx = getTenantContext(req);
    return this.servicePackages.list(ctx.tenantId, query);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_SERVICE_PACKAGES)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.servicePackages.get(ctx.tenantId, id);
  }

  @Patch(":id/void")
  @Permissions(Permission.MANAGE_SERVICE_PACKAGES)
  void(@Req() req: Request, @Param("id") id: string, @Body() dto: VoidServicePackageDto) {
    const ctx = getTenantContext(req);
    return this.servicePackages.void(ctx.tenantId, id, ctx.userId, dto.reason);
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !UUID_RE.test(value)) {
    throw new ApiError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "A valid Idempotency-Key header (UUID) is required.",
    });
  }
  return value;
}
