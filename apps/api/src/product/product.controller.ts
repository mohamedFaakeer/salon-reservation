import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiError } from "@salon/shared";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateProductDto,
  CreateProductVariantDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateProductVariantDto,
} from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// ProductService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "./product.service";

/** Products/variants "back office" — reads open to whoever can also take a payment, writes MANAGE_INVENTORY only. */
@ApiTags("products")
@ApiBearerAuth()
@Controller("products")
@RequiresModule("inventory")
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Permissions(Permission.MANAGE_INVENTORY)
  create(@Req() req: Request, @Body() dto: CreateProductDto) {
    const ctx = getTenantContext(req);
    return this.productService.create(ctx.tenantId, dto, ctx.userId);
  }

  @Get()
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  list(@Req() req: Request, @Query() query: ProductQueryDto) {
    const ctx = getTenantContext(req);
    return this.productService.list(ctx.tenantId, query);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.productService.get(ctx.tenantId, id);
  }

  @Patch(":id")
  @Permissions(Permission.MANAGE_INVENTORY)
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    const ctx = getTenantContext(req);
    return this.productService.update(ctx.tenantId, id, dto, ctx.userId);
  }

  @Post(":productId/variants")
  @Permissions(Permission.MANAGE_INVENTORY)
  createVariant(@Req() req: Request, @Param("productId") productId: string, @Body() dto: CreateProductVariantDto) {
    const ctx = getTenantContext(req);
    return this.productService.createVariant(ctx.tenantId, productId, dto, ctx.userId);
  }

  @Patch(":productId/variants/:variantId")
  @Permissions(Permission.MANAGE_INVENTORY)
  updateVariant(
    @Req() req: Request,
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    const ctx = getTenantContext(req);
    return this.productService.updateVariant(ctx.tenantId, productId, variantId, dto, ctx.userId);
  }

  /**
   * A hard multer ceiling well above the real 2MB limit — just a backstop
   * against an enormous upload occupying memory before it's even read.
   * `ProductService.uploadImage` runs the real, precisely-coded constraints.
   */
  @Post(":id/image")
  @Permissions(Permission.MANAGE_INVENTORY)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5_000_000 } }))
  uploadImage(@Req() req: Request, @Param("id") id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    const ctx = getTenantContext(req);
    if (!file) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "No file was uploaded." });
    }
    return this.productService.uploadImage(ctx.tenantId, id, file.buffer);
  }

  @Delete(":id/image")
  @Permissions(Permission.MANAGE_INVENTORY)
  removeImage(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.productService.removeImage(ctx.tenantId, id);
  }

  @Post(":productId/variants/:variantId/image")
  @Permissions(Permission.MANAGE_INVENTORY)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5_000_000 } }))
  uploadVariantImage(
    @Req() req: Request,
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const ctx = getTenantContext(req);
    if (!file) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "No file was uploaded." });
    }
    return this.productService.uploadVariantImage(ctx.tenantId, productId, variantId, file.buffer);
  }

  @Delete(":productId/variants/:variantId/image")
  @Permissions(Permission.MANAGE_INVENTORY)
  removeVariantImage(@Req() req: Request, @Param("productId") productId: string, @Param("variantId") variantId: string) {
    const ctx = getTenantContext(req);
    return this.productService.removeVariantImage(ctx.tenantId, productId, variantId);
  }
}
