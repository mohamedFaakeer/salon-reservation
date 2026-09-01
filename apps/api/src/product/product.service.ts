import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ILike, Repository } from "typeorm";
import {
  ApiError,
  StockBatchStatus,
  StockMovementType,
  type CreateProductDto,
  type CreateProductVariantDto,
  type ProductQueryDto,
  type UpdateProductDto,
  type UpdateProductVariantDto,
  type VariantLookupQueryDto,
} from "@salon/shared";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { StockMovement } from "../entities/stock-movement.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
import { detectImage } from "../common/image.util";
import { colomboNow, daysBetween } from "../availability/time.util";
// CloudinaryService/AuditService/StockMutationService must stay VALUE
// imports: NestJS resolves constructor injection via design:paramtypes
// metadata at runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CloudinaryService } from "../cloudinary/cloudinary.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "../inventory/stock-mutation.service";

export interface ProductWithVariantCount extends Product {
  /** Every variant regardless of active/discontinued — the same "all fetched variants" count `get()` already implies via its own `variants` array. */
  variantCount: number;
}

export interface ProductListResult {
  data: ProductWithVariantCount[];
  meta: { total: number; limit: number; offset: number };
}

/**
 * A variant with its Phase C reorder signal attached — simple velocity vs.
 * a reorder point, per the confirmed scope (no ML/seasonal modeling, ever).
 * Computed fresh on every read, never stored: the ledger (`stock_movement`)
 * is the one source of truth for what actually sold.
 */
export interface VariantWithReorderSignal extends ProductVariant {
  /** Average units sold per day over the trailing window; null with no sales in it. */
  salesVelocityPerDay: number | null;
  /** quantityOnHand / velocity; null when there's no velocity to divide by. */
  daysOfStockLeft: number | null;
  /** True if under the reorder point, or projected to run out within REORDER_SOON_DAYS. */
  reorderSoon: boolean;
  /** Earliest `expiresAt` among this variant's active batches; null when untracked or none set. */
  nearestExpiryDate: string | null;
  /** True when `nearestExpiryDate` is already in the past — expiry only ever affected draw order before this, never sale eligibility (that stays true: this is a warning signal, not a block). */
  hasExpiredBatch: boolean;
  /** True when `nearestExpiryDate` falls within EXPIRY_SOON_DAYS and isn't already expired. */
  expiringSoon: boolean;
  /** The one active batch's serial number, only when `quantityOnHand === 1`; null otherwise (including "several serialised units in stock" — see multiple batches, not one value). */
  soleSerialNumber: string | null;
}

export interface VariantListResult {
  data: VariantWithReorderSignal[];
  meta: { total: number; limit: number; offset: number };
}

/** Trailing window the velocity average is taken over. */
const VELOCITY_WINDOW_DAYS = 30;
/** "Soon" as in an owner would want to know this week, not this quarter. */
const REORDER_SOON_DAYS = 7;
/** Shelf-life warning window — longer than REORDER_SOON_DAYS on purpose: restock lead time and product shelf life are different clocks. Confirmed with the user. */
const EXPIRY_SOON_DAYS = 30;

/**
 * A little more generous than a logo's (CLAUDE.md §35.2 area): product
 * photography is real merchandise, not a brand mark, so a wider aspect
 * ratio and a larger byte ceiling are reasonable without inviting banner-
 * sized uploads.
 */
const PRODUCT_IMAGE_MAX_BYTES = 2_000_000;
const PRODUCT_IMAGE_MIN_DIMENSION = 200;
const PRODUCT_IMAGE_MAX_DIMENSION = 4000;
const PRODUCT_IMAGE_MAX_ASPECT_RATIO = 3;

/**
 * Products/Stock "back office" reads and writes — everything gated by
 * MANAGE_INVENTORY. Stock levels themselves are never touched here: they
 * move only through `StockReceiptService`/`InventoryAdjustmentService`/
 * `RetailSaleService`, all via `StockMutationService`.
 */
@Injectable()
export class ProductService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    @InjectRepository(StockBatch) private readonly batches: Repository<StockBatch>,
    @InjectRepository(StockMovement) private readonly movements: Repository<StockMovement>,
    private readonly cloudinary: CloudinaryService,
    private readonly audit: AuditService,
    private readonly stockMutation: StockMutationService,
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
    const [products, total] = await this.products.findAndCount({
      where: q ? [{ ...where, name: ILike(`%${q}%`) }, { ...where, brand: ILike(`%${q}%`) }] : where,
      order: { name: "ASC" },
      take: query.limit,
      skip: query.offset,
    });
    const counts = await this.variantCountsFor(products.map((p) => p.id));
    const data = products.map((p) => ({ ...p, variantCount: counts.get(p.id) ?? 0 }));
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  /**
   * Distinct category/brand values across the tenant's sellable catalog —
   * same "active product" condition `lookupVariants` already applies, so a
   * pill this returns is never a dead end that matches nothing in the grid a
   * cashier can actually browse. Free text, so no fixed list to fall back to
   * — a brand-new tenant with nothing categorised yet gets two empty arrays,
   * which the filter row renders as just "All items" with no pills to pick.
   */
  async facets(tenantId: string): Promise<{ categories: string[]; brands: string[] }> {
    const categoryRows = await this.products
      .createQueryBuilder("p")
      .select("DISTINCT p.category", "value")
      .where("p.tenantId = :tenantId", { tenantId })
      .andWhere("p.active = true")
      .andWhere("p.category IS NOT NULL")
      .orderBy("p.category", "ASC")
      .getRawMany<{ value: string }>();
    const brandRows = await this.products
      .createQueryBuilder("p")
      .select("DISTINCT p.brand", "value")
      .where("p.tenantId = :tenantId", { tenantId })
      .andWhere("p.active = true")
      .andWhere("p.brand IS NOT NULL")
      .orderBy("p.brand", "ASC")
      .getRawMany<{ value: string }>();
    return {
      categories: categoryRows.map((r) => r.value),
      brands: brandRows.map((r) => r.value),
    };
  }

  /** One grouped count query for the whole page of products, not one query per row. */
  private async variantCountsFor(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.variants
      .createQueryBuilder("v")
      .select('v."productId"', "productId")
      .addSelect("COUNT(*)::int", "count")
      .where('v."productId" IN (:...productIds)', { productIds })
      .groupBy('v."productId"')
      .getRawMany<{ productId: string; count: number }>();
    return new Map(rows.map((r) => [r.productId, Number(r.count)]));
  }

  async get(tenantId: string, id: string): Promise<{ product: Product; variants: VariantWithReorderSignal[] }> {
    const product = await this.findOwned(tenantId, id);
    const variants = await this.variants.find({ where: { tenantId, productId: id }, order: { sku: "ASC" } });
    const variantIds = variants.map((v) => v.id);
    const velocity = await this.salesVelocityFor(tenantId, variantIds);
    const batchSignals = await this.batchSignalsFor(tenantId, variantIds);
    const withSignals = variants.map((v) => this.attachReorderSignal(v, velocity.get(v.id) ?? 0, batchSignals.get(v.id) ?? null));
    return { product, variants: withSignals };
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
    const opening = this.validateOpeningStock(product, dto);

    return this.dataSource.transaction(async (manager) => {
      let variant: ProductVariant;
      try {
        variant = await manager.getRepository(ProductVariant).save(
          manager.getRepository(ProductVariant).create({
            tenantId,
            productId: product.id,
            sku: dto.sku.trim(),
            barcode: dto.barcode?.trim() || null,
            attributes: dto.attributes ?? {},
            priceCents: dto.priceCents,
            weightedAvgCostCents: opening?.unitCostCents ?? 0,
            quantityOnHand: 0,
            reorderPoint: dto.reorderPoint ?? null,
            active: true,
          }),
        );
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

      if (opening) {
        variant = await this.stockMutation.openBatch(manager, {
          tenantId,
          variantId: variant.id,
          quantity: opening.quantity,
          unitCostCents: opening.unitCostCents,
          lotCode: opening.lotCode,
          expiresAt: opening.expiresAt,
          serialNumber: opening.serialNumber,
          referenceType: "ProductVariant",
          referenceId: variant.id,
          actorUserId,
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "PRODUCT_VARIANT_CREATED",
          entityType: "ProductVariant",
          entityId: variant.id,
          metadata: { sku: variant.sku, productId: product.id, openingQuantity: opening?.quantity ?? 0 },
        },
        manager,
      );
      return variant;
    });
  }

  /**
   * Turns the DTO's flat `opening*` fields into a validated batch to open,
   * or `null` when no opening stock was given at all. Throws rather than
   * silently dropping data: a caller who filled in quantity but forgot cost
   * (or vice versa) gets told, not left with a batch that has one field
   * wrong.
   */
  private validateOpeningStock(
    product: Product,
    dto: CreateProductVariantDto,
  ): { quantity: number; unitCostCents: number; lotCode: string | null; expiresAt: string | null; serialNumber: string | null } | null {
    if (dto.openingQuantity === undefined && dto.openingUnitCostCents === undefined) {
      return null;
    }
    if (dto.openingQuantity === undefined || dto.openingUnitCostCents === undefined) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Give both an opening quantity and a unit cost, or leave both blank.",
      });
    }
    if (product.tracksExpiry && !dto.openingExpiresAt) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: `${product.name} tracks expiry — opening stock needs an expiry date.`,
      });
    }
    if (product.trackSerial) {
      if (!dto.openingSerialNumber) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: `${product.name} tracks serial numbers — opening stock needs a serial number.`,
        });
      }
      if (dto.openingQuantity !== 1) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "A serialised product must open with exactly one unit — use Receive stock to add more.",
        });
      }
    }
    return {
      quantity: dto.openingQuantity,
      unitCostCents: dto.openingUnitCostCents,
      lotCode: dto.openingLotCode?.trim() || null,
      expiresAt: dto.openingExpiresAt ?? null,
      serialNumber: dto.openingSerialNumber?.trim() || null,
    };
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
      // UAT PRD-16: a deactivated PRODUCT's still-active variants must stop
      // being sellable too — the product-level toggle's own copy ("stop it
      // appearing in Quick Sale") was a promise this query didn't keep.
      .andWhere("product.active = true")
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
    // Quick Sale's category/brand filter pills — additive to `q`, not a
    // replacement, so a cashier can type and filter at the same time.
    if (query.category) {
      qb.andWhere("product.category = :category", { category: query.category });
    }
    if (query.brand) {
      qb.andWhere("product.brand = :brand", { brand: query.brand });
    }

    const [rows, total] = await qb.getManyAndCount();
    const variantIds = rows.map((v) => v.id);
    const velocity = await this.salesVelocityFor(tenantId, variantIds);
    const batchSignals = await this.batchSignalsFor(tenantId, variantIds);
    const data = rows.map((v) => this.attachReorderSignal(v, velocity.get(v.id) ?? 0, batchSignals.get(v.id) ?? null));

    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  /**
   * Average units sold per day over the trailing window, per variant — a
   * single grouped aggregate over the append-only ledger rather than one
   * query per row. Only `SALE` movements count: a receipt, a restock or a
   * manual adjustment isn't demand.
   */
  private async salesVelocityFor(tenantId: string, variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const since = new Date(Date.now() - VELOCITY_WINDOW_DAYS * 24 * 60 * 60_000);
    const rows = await this.movements
      .createQueryBuilder("m")
      .select('m."variantId"', "variantId")
      .addSelect('SUM(-m."quantityDelta")::int', "unitsSold")
      .where('m."tenantId" = :tenantId', { tenantId })
      .andWhere("m.type = :type", { type: StockMovementType.SALE })
      .andWhere('m."variantId" IN (:...variantIds)', { variantIds })
      .andWhere('m."createdAt" >= :since', { since })
      .groupBy('m."variantId"')
      .getRawMany<{ variantId: string; unitsSold: number }>();

    return new Map(rows.map((r) => [r.variantId, Number(r.unitsSold) / VELOCITY_WINDOW_DAYS]));
  }

  /**
   * Earliest active batch expiry per variant — one grouped aggregate, same
   * shape as `salesVelocityFor` above, not one query per row. Only `ACTIVE`
   * batches count: a depleted/quarantined/written-off batch isn't sitting on
   * a shelf about to expire, it's already gone. This never affects whether a
   * batch is *sellable* (that stays draw-order-only, per `allocateFifo`) —
   * it's purely the read-side signal Quick Sale and the Stock page warn from.
   *
   * `soleSerialNumber` is `MIN(serialNumber)` — meaningless on its own for a
   * variant with several active batches, so the caller only reads it when
   * `quantityOnHand === 1` (a serialised product opens/receives exactly one
   * unit per batch by design, so "1 on hand" and "exactly one active batch"
   * are the same fact). `MIN`/`MIN` over nulls resolves to null exactly when
   * nothing is tracked, with no separate `WHERE ... IS NOT NULL` needed.
   */
  private async batchSignalsFor(
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, { nearestExpiryDate: string | null; soleSerialNumber: string | null }>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const rows = await this.batches
      .createQueryBuilder("b")
      .select('b."variantId"', "variantId")
      .addSelect('MIN(b."expiresAt")', "nearestExpiryDate")
      .addSelect('MIN(b."serialNumber")', "soleSerialNumber")
      .where('b."tenantId" = :tenantId', { tenantId })
      .andWhere("b.status = :status", { status: StockBatchStatus.ACTIVE })
      .andWhere('b."variantId" IN (:...variantIds)', { variantIds })
      .groupBy('b."variantId"')
      .getRawMany<{ variantId: string; nearestExpiryDate: string | null; soleSerialNumber: string | null }>();

    return new Map(rows.map((r) => [r.variantId, { nearestExpiryDate: r.nearestExpiryDate, soleSerialNumber: r.soleSerialNumber }]));
  }

  private attachReorderSignal(
    variant: ProductVariant,
    velocityPerDay: number,
    batchSignals: { nearestExpiryDate: string | null; soleSerialNumber: string | null } | null,
  ): VariantWithReorderSignal {
    const daysOfStockLeft = velocityPerDay > 0 ? variant.quantityOnHand / velocityPerDay : null;
    const belowReorderPoint = variant.reorderPoint !== null && variant.quantityOnHand <= variant.reorderPoint;
    const runningOutSoon = daysOfStockLeft !== null && daysOfStockLeft <= REORDER_SOON_DAYS;

    const nearestExpiryDate = batchSignals?.nearestExpiryDate ?? null;
    const today = colomboNow(new Date()).date;
    const hasExpiredBatch = nearestExpiryDate !== null && nearestExpiryDate < today;
    const daysToExpiry = nearestExpiryDate !== null ? daysBetween(today, nearestExpiryDate) : null;
    const expiringSoon = !hasExpiredBatch && daysToExpiry !== null && daysToExpiry <= EXPIRY_SOON_DAYS;

    // Only meaningful with exactly one unit on hand — see the doc comment on `batchSignalsFor`.
    const soleSerialNumber = variant.quantityOnHand === 1 ? (batchSignals?.soleSerialNumber ?? null) : null;

    return {
      ...variant,
      salesVelocityPerDay: velocityPerDay > 0 ? Math.round(velocityPerDay * 100) / 100 : null,
      daysOfStockLeft: daysOfStockLeft !== null ? Math.round(daysOfStockLeft * 10) / 10 : null,
      reorderSoon: belowReorderPoint || runningOutSoon,
      nearestExpiryDate,
      hasExpiredBatch,
      expiringSoon,
      soleSerialNumber,
    };
  }

  /**
   * Active lots/serials for one variant, oldest-expiring first — exactly the
   * FIFO order `RetailSaleService.allocateBatches` sells against. Used to
   * populate the "adjust a specific batch" picker so a correction on a
   * tracked product still lands on a real batch, keeping
   * `quantityOnHand` in step with `sum(batch.quantityRemaining)`.
   */
  async listActiveBatches(tenantId: string, variantId: string): Promise<StockBatch[]> {
    await this.findOwnedVariantById(tenantId, variantId);
    return this.batches.find({
      where: { tenantId, variantId, status: StockBatchStatus.ACTIVE },
      order: { expiresAt: "ASC", createdAt: "ASC" },
    });
  }

  async uploadImage(tenantId: string, id: string, buffer: Buffer): Promise<Product> {
    this.assertImageValid(buffer);
    const product = await this.findOwned(tenantId, id);
    const imageUrl = await this.cloudinary.uploadProductImage(buffer, `product-images/${tenantId}/products`);
    product.imageUrl = imageUrl;
    return this.products.save(product);
  }

  /** No Cloudinary-side delete — an orphaned free-tier asset is an accepted, documented gap, same as a tenant logo. */
  async removeImage(tenantId: string, id: string): Promise<Product> {
    const product = await this.findOwned(tenantId, id);
    product.imageUrl = null;
    return this.products.save(product);
  }

  async uploadVariantImage(tenantId: string, productId: string, variantId: string, buffer: Buffer): Promise<ProductVariant> {
    this.assertImageValid(buffer);
    const variant = await this.findOwnedVariant(tenantId, productId, variantId);
    const imageUrl = await this.cloudinary.uploadProductImage(buffer, `product-images/${tenantId}/variants`);
    variant.imageUrl = imageUrl;
    return this.variants.save(variant);
  }

  async removeVariantImage(tenantId: string, productId: string, variantId: string): Promise<ProductVariant> {
    const variant = await this.findOwnedVariant(tenantId, productId, variantId);
    variant.imageUrl = null;
    return this.variants.save(variant);
  }

  private assertImageValid(buffer: Buffer): void {
    if (buffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
      throw new ApiError({
        statusCode: 400,
        code: "PRODUCT_IMAGE_FILE_TOO_LARGE",
        message: `That file is too large — the limit is ${PRODUCT_IMAGE_MAX_BYTES / 1_000_000} MB.`,
      });
    }
    const detected = detectImage(buffer);
    if (!detected) {
      throw new ApiError({
        statusCode: 400,
        code: "PRODUCT_IMAGE_INVALID_FILE_TYPE",
        message: "That isn't a PNG, JPEG or WebP image.",
      });
    }
    const { width, height } = detected;
    if (
      width < PRODUCT_IMAGE_MIN_DIMENSION ||
      height < PRODUCT_IMAGE_MIN_DIMENSION ||
      width > PRODUCT_IMAGE_MAX_DIMENSION ||
      height > PRODUCT_IMAGE_MAX_DIMENSION
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "PRODUCT_IMAGE_DIMENSIONS_OUT_OF_RANGE",
        message: `Image dimensions must be between ${PRODUCT_IMAGE_MIN_DIMENSION}×${PRODUCT_IMAGE_MIN_DIMENSION} and ${PRODUCT_IMAGE_MAX_DIMENSION}×${PRODUCT_IMAGE_MAX_DIMENSION}px.`,
      });
    }
    const ratio = width / height;
    if (ratio > PRODUCT_IMAGE_MAX_ASPECT_RATIO || ratio < 1 / PRODUCT_IMAGE_MAX_ASPECT_RATIO) {
      throw new ApiError({
        statusCode: 400,
        code: "PRODUCT_IMAGE_ASPECT_RATIO_INVALID",
        message: `That's an unusually elongated shape for a product photo — keep it within ${PRODUCT_IMAGE_MAX_ASPECT_RATIO}:1.`,
      });
    }
  }

  private async findOwnedVariantById(tenantId: string, variantId: string): Promise<ProductVariant> {
    const variant = await this.variants.findOne({ where: { tenantId, id: variantId } });
    if (!variant) {
      throw new ApiError({ statusCode: 404, code: "PRODUCT_VARIANT_NOT_FOUND", message: "Variant not found." });
    }
    return variant;
  }
}
