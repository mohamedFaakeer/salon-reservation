import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ILike, In, Repository } from "typeorm";
import {
  ApiError,
  type AddBundleComponentDto,
  type CreateProductBundleDto,
  type ProductBundleQueryDto,
  type UpdateBundleComponentDto,
  type UpdateProductBundleDto,
} from "@salon/shared";
import { ProductBundle } from "../entities/product-bundle.entity";
import { ProductBundleComponent } from "../entities/product-bundle-component.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
import type { BundleComponentView, BundleView } from "./bundle.types";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface BundleListResult {
  data: BundleView[];
  meta: { total: number; limit: number; offset: number };
}

/**
 * Bundles (kits sold as one line) — everything gated by MANAGE_INVENTORY.
 * A bundle never stores its own stock count: `availableCount` is always
 * computed live from its components' current `quantityOnHand`, so it can
 * never drift out of sync with what the bundle is actually made of.
 */
@Injectable()
export class BundleService {
  constructor(
    @InjectRepository(ProductBundle) private readonly bundles: Repository<ProductBundle>,
    @InjectRepository(ProductBundleComponent) private readonly components: Repository<ProductBundleComponent>,
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateProductBundleDto, actorUserId: string): Promise<BundleView> {
    const variantIds = dto.components.map((c) => c.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new ApiError({
        statusCode: 400,
        code: "DUPLICATE_COMPONENT_VARIANT",
        message: "The same variant was listed more than once.",
      });
    }
    const ownedVariants = await this.variants.find({ where: { tenantId, id: In(variantIds) }, relations: { product: true } });
    if (ownedVariants.length !== variantIds.length) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_VARIANT_IDS",
        message: "One or more components don't belong to this tenant.",
      });
    }

    const bundle = await this.bundles.save(
      this.bundles.create({ tenantId, name: dto.name.trim(), priceCents: dto.priceCents, active: true }),
    );
    const componentRows = await this.components.save(
      dto.components.map((c) =>
        this.components.create({ bundleId: bundle.id, variantId: c.variantId, quantityPerBundle: c.quantityPerBundle }),
      ),
    );

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_BUNDLE_CREATED",
      entityType: "ProductBundle",
      entityId: bundle.id,
      metadata: { name: bundle.name, componentCount: componentRows.length },
    });

    return this.toView(bundle, componentRows, ownedVariants);
  }

  async update(tenantId: string, id: string, dto: UpdateProductBundleDto, actorUserId: string): Promise<BundleView> {
    const bundle = await this.findOwned(tenantId, id);
    if (dto.name !== undefined) bundle.name = dto.name.trim();
    if (dto.priceCents !== undefined) bundle.priceCents = dto.priceCents;
    if (dto.active !== undefined) bundle.active = dto.active;
    const saved = await this.bundles.save(bundle);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_BUNDLE_UPDATED",
      entityType: "ProductBundle",
      entityId: saved.id,
      metadata: { name: saved.name, active: saved.active },
    });

    return this.get(tenantId, id);
  }

  async list(tenantId: string, query: ProductBundleQueryDto): Promise<BundleListResult> {
    const q = query.q?.trim();
    const where = { tenantId, ...(query.includeInactive ? {} : { active: true }) };
    const [bundles, total] = await this.bundles.findAndCount({
      where: q ? { ...where, name: ILike(`%${q}%`) } : where,
      order: { name: "ASC" },
      take: query.limit,
      skip: query.offset,
    });
    if (bundles.length === 0) {
      return { data: [], meta: { total, limit: query.limit, offset: query.offset } };
    }

    const bundleIds = bundles.map((b) => b.id);
    const componentRows = await this.components.find({ where: { bundleId: In(bundleIds) } });
    const variantIds = [...new Set(componentRows.map((c) => c.variantId))];
    const variantRows =
      variantIds.length > 0 ? await this.variants.find({ where: { id: In(variantIds) }, relations: { product: true } }) : [];

    const data = bundles.map((bundle) =>
      this.toView(
        bundle,
        componentRows.filter((c) => c.bundleId === bundle.id),
        variantRows,
      ),
    );
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  async get(tenantId: string, id: string): Promise<BundleView> {
    const bundle = await this.findOwned(tenantId, id);
    const componentRows = await this.components.find({ where: { bundleId: id } });
    const variantIds = componentRows.map((c) => c.variantId);
    const variantRows =
      variantIds.length > 0 ? await this.variants.find({ where: { id: In(variantIds) }, relations: { product: true } }) : [];
    return this.toView(bundle, componentRows, variantRows);
  }

  async findOwned(tenantId: string, id: string): Promise<ProductBundle> {
    const bundle = await this.bundles.findOne({ where: { tenantId, id } });
    if (!bundle) {
      throw new ApiError({ statusCode: 404, code: "PRODUCT_BUNDLE_NOT_FOUND", message: "Bundle not found." });
    }
    return bundle;
  }

  async addComponent(
    tenantId: string,
    bundleId: string,
    dto: AddBundleComponentDto,
    actorUserId: string,
  ): Promise<BundleView> {
    await this.findOwned(tenantId, bundleId);
    const variant = await this.variants.findOne({ where: { tenantId, id: dto.variantId } });
    if (!variant) {
      throw new ApiError({ statusCode: 400, code: "INVALID_VARIANT_IDS", message: "That variant doesn't belong to this tenant." });
    }

    try {
      await this.components.save(
        this.components.create({ bundleId, variantId: dto.variantId, quantityPerBundle: dto.quantityPerBundle }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError({
          statusCode: 409,
          code: "DUPLICATE_COMPONENT_VARIANT",
          message: "This variant is already a component of the bundle.",
        });
      }
      throw err;
    }

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_BUNDLE_COMPONENT_ADDED",
      entityType: "ProductBundle",
      entityId: bundleId,
      metadata: { variantId: dto.variantId, quantityPerBundle: dto.quantityPerBundle },
    });

    return this.get(tenantId, bundleId);
  }

  async updateComponent(
    tenantId: string,
    bundleId: string,
    componentId: string,
    dto: UpdateBundleComponentDto,
    actorUserId: string,
  ): Promise<BundleView> {
    await this.findOwned(tenantId, bundleId);
    const component = await this.components.findOne({ where: { id: componentId, bundleId } });
    if (!component) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Component not found." });
    }
    component.quantityPerBundle = dto.quantityPerBundle;
    await this.components.save(component);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_BUNDLE_COMPONENT_UPDATED",
      entityType: "ProductBundle",
      entityId: bundleId,
      metadata: { componentId, quantityPerBundle: dto.quantityPerBundle },
    });

    return this.get(tenantId, bundleId);
  }

  async removeComponent(tenantId: string, bundleId: string, componentId: string, actorUserId: string): Promise<BundleView> {
    await this.findOwned(tenantId, bundleId);
    const component = await this.components.findOne({ where: { id: componentId, bundleId } });
    if (!component) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Component not found." });
    }
    await this.components.delete({ id: componentId });

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PRODUCT_BUNDLE_COMPONENT_REMOVED",
      entityType: "ProductBundle",
      entityId: bundleId,
      metadata: { componentId, variantId: component.variantId },
    });

    return this.get(tenantId, bundleId);
  }

  /**
   * The read `RetailSaleService.checkout` uses to fan a bundle line out into
   * its components — a plain (non-transactional) read is fine here, since
   * what actually needs transactional locking is each component's
   * `ProductVariant` row, which checkout locks itself via `StockMutationService`.
   */
  async getSellableBundleWithComponents(
    tenantId: string,
    bundleId: string,
  ): Promise<{ bundle: ProductBundle; components: ProductBundleComponent[] }> {
    const bundle = await this.bundles.findOne({ where: { tenantId, id: bundleId } });
    if (!bundle || !bundle.active) {
      throw new ApiError({ statusCode: 404, code: "PRODUCT_BUNDLE_NOT_FOUND", message: "That bundle isn't available." });
    }
    const components = await this.components.find({ where: { bundleId } });
    if (components.length === 0) {
      throw new ApiError({
        statusCode: 409,
        code: "BUNDLE_HAS_NO_COMPONENTS",
        message: "This bundle has no components configured yet.",
      });
    }
    return { bundle, components };
  }

  private toView(bundle: ProductBundle, components: ProductBundleComponent[], variants: ProductVariant[]): BundleView {
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const componentViews: BundleComponentView[] = components.map((c) => {
      const variant = variantById.get(c.variantId);
      return {
        id: c.id,
        variantId: c.variantId,
        sku: variant?.sku ?? "—",
        productName: variant?.product?.name ?? "—",
        quantityPerBundle: c.quantityPerBundle,
        quantityOnHand: variant?.quantityOnHand ?? 0,
      };
    });
    const availableCount =
      componentViews.length === 0
        ? 0
        : Math.min(...componentViews.map((c) => Math.floor(c.quantityOnHand / c.quantityPerBundle)));

    return {
      id: bundle.id,
      name: bundle.name,
      priceCents: bundle.priceCents,
      active: bundle.active,
      availableCount,
      components: componentViews,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
    };
  }
}
