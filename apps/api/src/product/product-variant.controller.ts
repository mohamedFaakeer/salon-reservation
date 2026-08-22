import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// VariantLookupQueryDto must stay a VALUE import: ValidationPipe resolves it
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { VariantLookupQueryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// ProductService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "./product.service";

/**
 * The lookup endpoint both manual entry and (Phase C) camera barcode
 * scanning hit while building a Quick Sale cart — a separate top-level
 * resource from `/products` since a cart is built against SKUs, not the
 * product hierarchy.
 */
@ApiTags("products")
@ApiBearerAuth()
@Controller("product-variants")
@RequiresModule("inventory")
@Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
export class ProductVariantController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  lookup(@Req() req: Request, @Query() query: VariantLookupQueryDto) {
    const ctx = getTenantContext(req);
    return this.productService.lookupVariants(ctx.tenantId, query);
  }

  /** Active lots/serials for one variant, oldest-expiring first — feeds the Adjust Stock drawer's "specific batch" picker. */
  @Get(":id/batches")
  @Permissions(Permission.MANAGE_INVENTORY)
  listBatches(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.productService.listActiveBatches(ctx.tenantId, id);
  }
}
