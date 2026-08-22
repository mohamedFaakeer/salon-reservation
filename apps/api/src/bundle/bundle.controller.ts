import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AddBundleComponentDto,
  CreateProductBundleDto,
  ProductBundleQueryDto,
  UpdateBundleComponentDto,
  UpdateProductBundleDto,
} from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// BundleService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BundleService } from "./bundle.service";

/** Bundles (kits) — reads open to whoever can also take a payment (Quick Sale needs to browse them), writes MANAGE_INVENTORY only. */
@ApiTags("bundles")
@ApiBearerAuth()
@Controller("product-bundles")
@RequiresModule("inventory")
export class BundleController {
  constructor(private readonly bundles: BundleService) {}

  @Post()
  @Permissions(Permission.MANAGE_INVENTORY)
  create(@Req() req: Request, @Body() dto: CreateProductBundleDto) {
    const ctx = getTenantContext(req);
    return this.bundles.create(ctx.tenantId, dto, ctx.userId);
  }

  @Get()
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  list(@Req() req: Request, @Query() query: ProductBundleQueryDto) {
    const ctx = getTenantContext(req);
    return this.bundles.list(ctx.tenantId, query);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.bundles.get(ctx.tenantId, id);
  }

  @Patch(":id")
  @Permissions(Permission.MANAGE_INVENTORY)
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateProductBundleDto) {
    const ctx = getTenantContext(req);
    return this.bundles.update(ctx.tenantId, id, dto, ctx.userId);
  }

  @Post(":id/components")
  @Permissions(Permission.MANAGE_INVENTORY)
  addComponent(@Req() req: Request, @Param("id") id: string, @Body() dto: AddBundleComponentDto) {
    const ctx = getTenantContext(req);
    return this.bundles.addComponent(ctx.tenantId, id, dto, ctx.userId);
  }

  @Patch(":id/components/:componentId")
  @Permissions(Permission.MANAGE_INVENTORY)
  updateComponent(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("componentId") componentId: string,
    @Body() dto: UpdateBundleComponentDto,
  ) {
    const ctx = getTenantContext(req);
    return this.bundles.updateComponent(ctx.tenantId, id, componentId, dto, ctx.userId);
  }

  @Delete(":id/components/:componentId")
  @Permissions(Permission.MANAGE_INVENTORY)
  removeComponent(@Req() req: Request, @Param("id") id: string, @Param("componentId") componentId: string) {
    const ctx = getTenantContext(req);
    return this.bundles.removeComponent(ctx.tenantId, id, componentId, ctx.userId);
  }
}
