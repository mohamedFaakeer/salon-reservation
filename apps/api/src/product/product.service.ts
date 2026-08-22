import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ILike, Repository } from "typeorm";
import {
  ApiError,
  type CreateProductDto,
  type CreateProductVariantDto,
  type ProductQueryDto,
  type UpdateProductDto,
  type UpdateProductVariantDto,
  type VariantLookupQueryDto,
} from "@salon/shared";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface ProductListResult {
  data: Product[];
  meta: { total: number; limit: number; offset: number };
}

export interface VariantListResult {
  data: ProductVariant[];
  meta: { total: number; limit: number; offset: number };
}

/**
 * Products/Stock "back office" reads and writes — everything gated by
 * MANAGE_INVENTORY. Stock levels themselves are never touched here: they
 * move only through `StockReceiptService`/`InventoryAdjustmentService`/
 * `RetailSaleService`, all via `StockMutationService`.
 */
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateProductDto, actorUserId: string): Promise<Product> {
    const product = await this.products.save(
      this.products.create({
        tenantId,
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        brand: dto.brand?.trim() || null,
        description: dto.description?.trim() || null,
        tracksExpiry: dto.tracksExpiry ?? false,
        trackSerial: dto.trackSerial ?? false,
        active: true,
      }),
    );
    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_CREATED",
      entityType: "Product",
      entityId: product.id,
      metadata: { name: product.name },
    });
    return product;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto, actorUserId: string): Promise<Product> {
    const product = await this.findOwned(tenantId, id);
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.category !== undefined) product.category = dto.category.trim() || null;
    if (dto.brand !== undefined) product.brand = dto.brand.trim() || null;
    if (dto.description !== undefined) product.description = dto.description.trim() || null;
    if (dto.tracksExpiry !== undefined) product.tracksExpiry = dto.tracksExpiry;
    if (dto.trackSerial !== undefined) product.trackSerial = dto.trackSerial;
    if (dto.active !== undefined) product.active = dto.active;

    const saved = await this.products.save(product);
    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: saved.id,
      metadata: { name: saved.name, active: saved.active },
    });
    return saved;
  }

  async list(tenantId: string, query: ProductQueryDto): Promise<ProductListResult> {
    const q = query.q?.trim();
    const where = {
      tenantId,
      ...(query.includeInactive ? {} : { active: true }),
    };
    const [data, total] = await this.products.findAndCount({
      where: q ? [{ ...where, name: ILike(`%${q}%`) }, { ...where, brand: ILike(`%${q}%`) }] : where,
      order: { name: "ASC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  async get(tenantId: string, id: string): Promise<{ product: Product; variants: ProductVariant[] }> {
    const product = await this.findOwned(tenantId, id);
    const variants = await this.variants.find({ where: { tenantId, productId: id }, order: { sku: "ASC" } });
    return { product, variants };
  }

  async findOwned(tenantId: string, id: string): Promise<Product> {
    const product = await this.products.findOne({ where: { tenantId, id } });
    if (!product) {
      throw new ApiError({ statusCode: 404, code: "PRODUCT_NOT_FOUND", message: "Product not found." });
    }
    return product;
  }

  async createVariant(
    tenantId: string,
    productId: string,
    dto: CreateProductVariantDto,
    actorUserId: string,
  ): Promise<ProductVariant> {
    const product = await this.findOwned(tenantId, productId);
    try {
      const variant = await this.variants.save(
        this.variants.create({
          tenantId,
          productId: product.id,
          sku: dto.sku.trim(),
          barcode: dto.barcode?.trim() || null,
          attributes: dto.attributes ?? {},
          priceCents: dto.priceCents,
          weightedAvgCostCents: 0,
          quantityOnHand: 0,
          reorderPoint: dto.reorderPoint ?? null,
          active: true,
        }),
      );
      await this.audit.record({
        tenantId,
        actorUserId,
        action: "PRODUCT_VARIANT_CREATED",
        entityType: "ProductVariant",
        entityId: variant.id,
        metadata: { sku: variant.sku, productId: product.id },
      });
      return variant;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError({
          statusCode: 409,
          code: "DUPLICATE_SKU_OR_BARCODE",
          message: "Another variant already uses this SKU or barcode.",
        });
      }
      throw err;
    }
  }

  async updateVariant(
    tenantId: string,
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
    actorUserId: string,
  ): Promise<ProductVariant> {
    await this.findOwned(tenantId, productId);
    const variant = await this.findOwnedVariant(tenantId, productId, variantId);

    if (dto.sku !== undefined) variant.sku = dto.sku.trim();
    if (dto.barcode !== undefined) variant.barcode = dto.barcode.trim() || null;
    if (dto.attributes !== undefined) variant.attributes = dto.attributes;
    if (dto.priceCents !== undefined) variant.priceCents = dto.priceCents;
    if (dto.reorderPoint !== undefined) variant.reorderPoint = dto.reorderPoint;
    if (dto.active !== undefined) variant.active = dto.active;

    try {
      const saved = await this.variants.save(variant);
      await this.audit.record({
        tenantId,
        actorUserId,
        action: "PRODUCT_VARIANT_UPDATED",
        entityType: "ProductVariant",
        entityId: saved.id,
        metadata: { sku: saved.sku, active: saved.active },
      });
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError({
          statusCode: 409,
          code: "DUPLICATE_SKU_OR_BARCODE",
          message: "Another variant already uses this SKU or barcode.",
        });
      }
      throw err;
    }
  }

  async findOwnedVariant(tenantId: string, productId: string, variantId: string): Promise<ProductVariant> {
    const variant = await this.variants.findOne({ where: { tenantId, productId, id: variantId } });
    if (!variant) {
      throw new ApiError({ statusCode: 404, code: "PRODUCT_VARIANT_NOT_FOUND", message: "Variant not found." });
    }
    return variant;
  }

  /**
   * GET /product-variants — the lookup endpoint both manual entry and (Phase
   * C) camera barcode scanning hit. `barcode` is an exact match (what a scan
   * or a USB/BT scanner-gun keystroke sends); `q` is a free-text SKU/name
   * search for browsing.
   */
  async lookupVariants(tenantId: string, query: VariantLookupQueryDto): Promise<VariantListResult> {
    const qb = this.variants
      .createQueryBuilder("v")
      .leftJoinAndSelect("v.product", "product")
      .where("v.tenantId = :tenantId", { tenantId })
      .andWhere("v.active = true")
      .orderBy("product.name", "ASC")
      .addOrderBy("v.sku", "ASC")
      .take(query.limit)
      .skip(query.offset);

    if (query.barcode) {
      qb.andWhere("v.barcode = :barcode", { barcode: query.barcode.trim() });
    } else if (query.q) {
      qb.andWhere("(v.sku ILIKE :q OR v.barcode ILIKE :q OR product.name ILIKE :q)", { q: `%${query.q}%` });
    }
    if (query.lowStockOnly) {
      qb.andWhere('v."reorderPoint" IS NOT NULL AND v."quantityOnHand" <= v."reorderPoint"');
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }
}
