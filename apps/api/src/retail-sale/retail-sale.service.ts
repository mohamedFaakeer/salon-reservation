import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import {
  ApiError,
  PaymentMethod,
  PaymentProviderName,
  PaymentStatus,
  PaymentType,
  RetailSaleStatus,
  StockBatchStatus,
  StockMovementType,
  type ConvertCustomLineDto,
  type RetailSaleCheckoutDto,
  type RetailSaleQueryDto,
} from "@salon/shared";
import { normalizePhone } from "../customer/phone.util";
import { Branch } from "../entities/branch.entity";
import { Payment } from "../entities/payment.entity";
import { Product } from "../entities/product.entity";
import type { ProductBundle } from "../entities/product-bundle.entity";
import type { ProductBundleComponent } from "../entities/product-bundle-component.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { RetailReturnLine } from "../entities/retail-return-line.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { PendingCustomLineView, RetailSaleReceiptView, RetailSaleView } from "./retail-sale.types";
// StockMutationService/CustomerService/BundleService/AuditService/
// ProductService must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "../inventory/stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "../customer/customer.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BundleService } from "../bundle/bundle.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "../product/product.service";

const SELLABLE_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD_CAPTURED,
  PaymentMethod.QR,
];

type ResolvedLine =
  | { kind: "variant"; variant: ProductVariant; quantity: number }
  | {
      kind: "bundle";
      bundle: ProductBundle;
      components: Array<{ component: ProductBundleComponent; variant: ProductVariant }>;
      quantity: number;
    }
  | { kind: "custom"; name: string; attribute: string | null; unitPriceCents: number; quantity: number };

/**
 * "Ring up items, take payment" — reuses the existing cash/bank/card
 * payment machinery rather than a parallel financial system (CLAUDE.md keeps
 * "full POS/ERP" out of scope). Creates its own `Payment` row directly, the
 * same as `GiftCardService`/`ServicePackageService`, rather than going
 * through `PaymentService.recordPaymentInternal` — that method is coupled to
 * an appointment's balance, which a retail sale has none of.
 */
@Injectable()
export class RetailSaleService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(RetailSale) private readonly sales: Repository<RetailSale>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    private readonly customers: CustomerService,
    private readonly stockMutation: StockMutationService,
    private readonly bundles: BundleService,
    private readonly audit: AuditService,
    private readonly productService: ProductService,
  ) {}

  async checkout(
    tenant: Tenant,
    dto: RetailSaleCheckoutDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RetailSaleView> {
    if (!SELLABLE_METHODS.includes(dto.paymentMethod)) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Choose cash, bank transfer, card or QR for how this sale was paid for.",
      });
    }
    for (const line of dto.lines) {
      const kindsGiven = [line.variantId, line.bundleId, line.custom].filter((v) => v !== undefined).length;
      if (kindsGiven !== 1) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Each cart line needs exactly one of variantId, bundleId or custom.",
        });
      }
    }

    // Bundle lookups are plain reads outside the transaction — only the
    // ProductVariant rows they resolve to need transactional locking, which
    // happens below alongside every other variant this cart touches.
    const bundleData = new Map<string, { bundle: ProductBundle; components: ProductBundleComponent[] }>();
    for (const line of dto.lines) {
      if (line.bundleId && !bundleData.has(line.bundleId)) {
        bundleData.set(line.bundleId, await this.bundles.getSellableBundleWithComponents(tenant.id, line.bundleId));
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const existingPayment = await paymentRepo.findOne({ where: { idempotencyKey } });
      if (existingPayment) {
        const existingSale = await manager.getRepository(RetailSale).findOne({ where: { paymentId: existingPayment.id } });
        if (existingSale) {
          return this.loadView(manager, existingSale.id);
        }
      }

      const customer = dto.customer
        ? await this.customers.findOrCreateForBooking(tenant.id, dto.customer, manager)
        : await this.customers.findOrCreateWalkIn(tenant.id, manager);

      // Lock every variant this cart touches — direct lines and every
      // bundle's components alike — in one globally consistent (sorted)
      // order, so two concurrent checkouts that share a variant (directly,
      // via a bundle, or both) can never deadlock against each other.
      const variantIds = new Set<string>();
      for (const line of dto.lines) {
        if (line.variantId) {
          variantIds.add(line.variantId);
        } else if (line.bundleId) {
          for (const c of bundleData.get(line.bundleId)!.components) {
            variantIds.add(c.variantId);
          }
        }
        // A `custom` line touches no ProductVariant — nothing to lock.
      }
      const lockedVariants = new Map<string, ProductVariant>();
      for (const variantId of [...variantIds].sort()) {
        lockedVariants.set(variantId, await this.stockMutation.lockVariant(manager, tenant.id, variantId));
      }

      // Price every line from the locked snapshot — never from the client.
      // The one exception is a `custom` line: there's no catalog row to
      // impersonate or undercut, so pricing it from the DTO is exactly as
      // trustworthy as any other field on this request.
      let subtotalCents = 0;
      const resolved: ResolvedLine[] = [];
      for (const line of dto.lines) {
        if (line.variantId) {
          const variant = lockedVariants.get(line.variantId)!;
          if (!variant.active) {
            throw new ApiError({
              statusCode: 409,
              code: "PRODUCT_VARIANT_INACTIVE",
              message: `${variant.sku} is no longer sold.`,
            });
          }
          subtotalCents += variant.priceCents * line.quantity;
          resolved.push({ kind: "variant", variant, quantity: line.quantity });
        } else if (line.bundleId) {
          const data = bundleData.get(line.bundleId)!;
          const components = data.components.map((component) => ({
            component,
            variant: lockedVariants.get(component.variantId)!,
          }));
          subtotalCents += data.bundle.priceCents * line.quantity;
          resolved.push({ kind: "bundle", bundle: data.bundle, components, quantity: line.quantity });
        } else {
          const custom = line.custom!;
          subtotalCents += custom.unitPriceCents * line.quantity;
          resolved.push({
            kind: "custom",
            name: custom.name.trim(),
            attribute: custom.attribute?.trim() || null,
            unitPriceCents: custom.unitPriceCents,
            quantity: line.quantity,
          });
        }
      }
      // Phase A/B: no bill-level discount on retail sales — see DECISIONS.md.
      const totalCents = subtotalCents;

      const payment = await paymentRepo.save(
        paymentRepo.create({
          tenantId: tenant.id,
          appointmentId: null,
          customerId: customer.id,
          amountCents: totalCents,
          method: dto.paymentMethod,
          state: PaymentStatus.SUCCESS,
          type: PaymentType.FULL,
          idempotencyKey,
          provider: PaymentProviderName.MANUAL,
          providerPaymentRef: null,
          recordedById: actorUserId,
          recordedAt: new Date(),
        }),
      );

      const sale = await manager.getRepository(RetailSale).save(
        manager.getRepository(RetailSale).create({
          tenantId: tenant.id,
          customerId: customer.id,
          paymentId: payment.id,
          subtotalCents,
          totalCents,
          soldById: actorUserId,
          status: RetailSaleStatus.COMPLETED,
        }),
      );

      // The circular pair (sale.paymentId / payment.retailSaleId) can't both
      // be set in one insert — payment is written first, sale second, then
      // this closes the loop, all inside the same transaction.
      payment.retailSaleId = sale.id;
      await paymentRepo.save(payment);

      for (const line of resolved) {
        if (line.kind === "variant") {
          const product = await this.products.findOne({ where: { id: line.variant.productId, tenantId: tenant.id } });
          const lineTotalCents = line.variant.priceCents * line.quantity;
          const saleLine = await manager.getRepository(RetailSaleLine).save(
            manager.getRepository(RetailSaleLine).create({
              saleId: sale.id,
              variantId: line.variant.id,
              bundleId: null,
              nameSnapshot: product?.name ?? line.variant.sku,
              skuSnapshot: line.variant.sku,
              attributeSnapshot: null,
              quantity: line.quantity,
              unitPriceCentsSnapshot: line.variant.priceCents,
              unitCostCentsSnapshot: line.variant.weightedAvgCostCents,
              lineTotalCents,
              convertedToVariantId: null,
            }),
          );
          await this.allocateAndDraw(manager, tenant.id, sale.id, saleLine.id, line.variant.id, line.quantity, actorUserId);
        } else if (line.kind === "bundle") {
          const unitCostCentsSnapshot = line.components.reduce(
            (sum, c) => sum + c.variant.weightedAvgCostCents * c.component.quantityPerBundle,
            0,
          );
          const lineTotalCents = line.bundle.priceCents * line.quantity;
          const saleLine = await manager.getRepository(RetailSaleLine).save(
            manager.getRepository(RetailSaleLine).create({
              saleId: sale.id,
              variantId: null,
              bundleId: line.bundle.id,
              nameSnapshot: line.bundle.name,
              skuSnapshot: null,
              attributeSnapshot: null,
              quantity: line.quantity,
              unitPriceCentsSnapshot: line.bundle.priceCents,
              unitCostCentsSnapshot,
              lineTotalCents,
              convertedToVariantId: null,
            }),
          );
          for (const c of line.components) {
            const neededQty = c.component.quantityPerBundle * line.quantity;
            await this.allocateAndDraw(manager, tenant.id, sale.id, saleLine.id, c.variant.id, neededQty, actorUserId);
          }
        } else {
          // Custom line: no variant/bundle to lock, no stock to draw — the
          // whole point is it isn't in the catalog. unitCostCentsSnapshot is
          // 0 because the real cost is genuinely unknown, not because it's
          // free; margin/COGS reporting must filter these out rather than
          // read 0 as a real number (see the entity's own doc comment).
          const lineTotalCents = line.unitPriceCents * line.quantity;
          await manager.getRepository(RetailSaleLine).save(
            manager.getRepository(RetailSaleLine).create({
              saleId: sale.id,
              variantId: null,
              bundleId: null,
              nameSnapshot: line.name,
              skuSnapshot: null,
              attributeSnapshot: line.attribute,
              quantity: line.quantity,
              unitPriceCentsSnapshot: line.unitPriceCents,
              unitCostCentsSnapshot: 0,
              lineTotalCents,
              convertedToVariantId: null,
            }),
          );
        }
      }

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "RETAIL_SALE_COMPLETED",
          entityType: "RetailSale",
          entityId: sale.id,
          metadata: {
            totalCents,
            lineCount: dto.lines.length,
            walkIn: !dto.customer,
            hasCustomLine: resolved.some((l) => l.kind === "custom"),
          },
        },
        manager,
      );

      return this.loadView(manager, sale.id);
    });
  }

  async list(tenantId: string, query: RetailSaleQueryDto): Promise<{ data: RetailSaleView[]; meta: { total: number; limit: number; offset: number } }> {
    const qb = this.sales
      .createQueryBuilder("s")
      .leftJoinAndSelect("s.customer", "customer")
      .leftJoinAndSelect("s.soldBy", "soldBy")
      .where("s.tenantId = :tenantId", { tenantId })
      .orderBy("s.createdAt", "DESC")
      .take(query.limit)
      .skip(query.offset);
    if (query.q) {
      qb.andWhere(
        "(customer.firstName ILIKE :q OR customer.lastName ILIKE :q OR customer.phone ILIKE :q)",
        { q: `%${query.q}%` },
      );
    }
    const [rows, total] = await qb.getManyAndCount();
    const data = await Promise.all(rows.map((row) => this.loadView(this.sales.manager, row.id)));
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  async get(tenantId: string, id: string): Promise<RetailSaleView> {
    const sale = await this.sales.findOne({ where: { tenantId, id } });
    if (!sale) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Sale not found." });
    }
    return this.loadView(this.sales.manager, id);
  }

  /**
   * No auth, no `tenantId` from a session — this is what `GET
   * /retail-sale-receipts/:id` (a link texted to the customer) resolves.
   * `phone` proves ownership the same way `BookingService.findByReferenceAndPhone`
   * does for booking references: the id alone is not treated as a credential.
   * A mismatch throws the same "not found" the missing-sale case throws, so
   * no oracle distinguishes "wrong phone" from "no such sale."
   */
  async getPublicReceipt(saleId: string, phone: string): Promise<RetailSaleReceiptView> {
    const sale = await this.sales.findOne({
      where: { id: saleId },
      relations: { customer: true, soldBy: true, payment: true, tenant: true },
    });
    if (!sale || sale.customer.phone !== normalizePhone(phone)) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Receipt not found." });
    }
    return this.buildReceiptView(sale);
  }

  /** The authenticated, tenant-scoped equivalent of `getPublicReceipt` — backs the staff receipt view in apps/admin. */
  async getReceipt(tenantId: string, saleId: string): Promise<RetailSaleReceiptView> {
    const sale = await this.sales.findOne({
      where: { id: saleId, tenantId },
      relations: { customer: true, soldBy: true, payment: true, tenant: true },
    });
    if (!sale) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Receipt not found." });
    }
    return this.buildReceiptView(sale);
  }

  private async buildReceiptView(sale: RetailSale): Promise<RetailSaleReceiptView> {
    const branch = await this.branches.findOne({ where: { tenantId: sale.tenantId } });
    const lines = await this.sales.manager.getRepository(RetailSaleLine).find({ where: { saleId: sale.id }, order: { createdAt: "ASC" } });

    return {
      id: sale.id,
      createdAt: sale.createdAt,
      salon: { name: sale.tenant.name, address: branch?.address ?? null, city: branch?.city ?? null, phone: branch?.phone ?? null },
      customer: {
        name: `${sale.customer.firstName} ${sale.customer.lastName}`.trim(),
        phone: sale.customer.phone,
        isWalkIn: sale.customer.isWalkInPlaceholder,
      },
      soldByName: sale.soldBy?.name ?? null,
      paymentMethod: sale.payment?.method ?? null,
      lines: lines.map((l) => ({
        id: l.id,
        bundleId: l.bundleId,
        nameSnapshot: l.nameSnapshot,
        skuSnapshot: l.skuSnapshot,
        attributeSnapshot: l.attributeSnapshot,
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
      })),
      subtotalCents: sale.subtotalCents,
      totalCents: sale.totalCents,
    };
  }

  /** GET /retail-sales/custom-lines/pending — every custom-sold line still needing review, oldest first. */
  async listPendingCustomLines(tenantId: string): Promise<PendingCustomLineView[]> {
    const rows = await this.sales.manager
      .getRepository(RetailSaleLine)
      .createQueryBuilder("l")
      .innerJoinAndSelect("l.sale", "sale")
      .leftJoinAndSelect("sale.customer", "customer")
      .leftJoinAndSelect("sale.soldBy", "soldBy")
      .where("sale.tenantId = :tenantId", { tenantId })
      .andWhere("l.variantId IS NULL")
      .andWhere("l.bundleId IS NULL")
      .andWhere("l.convertedToVariantId IS NULL")
      .orderBy("l.createdAt", "ASC")
      .getMany();

    return rows.map((l) => ({
      id: l.id,
      saleId: l.saleId,
      nameSnapshot: l.nameSnapshot,
      attributeSnapshot: l.attributeSnapshot,
      quantity: l.quantity,
      unitPriceCentsSnapshot: l.unitPriceCentsSnapshot,
      soldByName: l.sale.soldBy?.name ?? null,
      customerName: `${l.sale.customer.firstName} ${l.sale.customer.lastName}`.trim(),
      createdAt: l.createdAt,
    }));
  }

  /**
   * Turns one sold custom line into a real, searchable, stock-tracked
   * catalog product — a deliberate, later action by whoever holds
   * MANAGE_INVENTORY, never automatic. Reuses `ProductService.create`/
   * `createVariant` directly rather than duplicating catalog-insert logic,
   * so this naturally gets the same `PRODUCT_CREATED`/`PRODUCT_VARIANT_CREATED`
   * audit trail, validation and SKU/barcode uniqueness handling every other
   * catalog write already goes through. `quantityOnHand` stays 0 — this adds
   * a catalog entry, not stock; Receive stock is the existing, separate step
   * for that.
   */
  async convertCustomLineToProduct(
    tenantId: string,
    lineId: string,
    dto: ConvertCustomLineDto,
    actorUserId: string,
  ): Promise<ProductVariant> {
    if (Boolean(dto.productId) === Boolean(dto.productName)) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Give exactly one of productId (an existing product) or productName (a new one).",
      });
    }

    const line = await this.sales.manager.getRepository(RetailSaleLine).findOne({
      where: { id: lineId },
      relations: { sale: true },
    });
    if (!line || line.sale.tenantId !== tenantId) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "That sale line wasn't found." });
    }
    if (line.variantId || line.bundleId) {
      throw new ApiError({
        statusCode: 409,
        code: "NOT_A_CUSTOM_LINE",
        message: "This line already refers to a real catalog item.",
      });
    }
    if (line.convertedToVariantId) {
      throw new ApiError({
        statusCode: 409,
        code: "ALREADY_CONVERTED",
        message: "This line has already been added to the catalog.",
      });
    }

    const product = dto.productId
      ? await this.productService.findOwned(tenantId, dto.productId)
      : await this.productService.create(
          tenantId,
          { name: dto.productName!, category: dto.category, brand: dto.brand },
          actorUserId,
        );

    const variant = await this.productService.createVariant(
      tenantId,
      product.id,
      {
        sku: dto.sku,
        barcode: dto.barcode,
        attributes: dto.attributes ?? (line.attributeSnapshot ? { attribute: line.attributeSnapshot } : undefined),
        priceCents: dto.priceCents ?? line.unitPriceCentsSnapshot,
      },
      actorUserId,
    );

    // `ProductService.create`/`createVariant` already write their own
    // PRODUCT_CREATED/PRODUCT_VARIANT_CREATED audit entries above — the link
    // back to this sale line lives durably on `convertedToVariantId` itself
    // (queryable), so no second, duplicate audit record is written here.
    line.convertedToVariantId = variant.id;
    await this.sales.manager.getRepository(RetailSaleLine).save(line);

    return variant;
  }

  /** Shared by a plain variant line and each bundle component — one place that draws FIFO batches and writes the ledger. */
  private async allocateAndDraw(
    manager: EntityManager,
    tenantId: string,
    saleId: string,
    saleLineId: string,
    variantId: string,
    quantity: number,
    actorUserId: string,
  ): Promise<void> {
    const allocations = await this.stockMutation.allocateFifo(manager, tenantId, variantId, quantity);
    for (const { batch, quantity: take } of allocations) {
      batch.quantityRemaining -= take;
      if (batch.quantityRemaining <= 0) {
        batch.quantityRemaining = 0;
        batch.status = StockBatchStatus.DEPLETED;
      }
      await manager.getRepository(StockBatch).save(batch);

      await manager.getRepository(RetailSaleLineBatch).save(
        manager.getRepository(RetailSaleLineBatch).create({
          saleLineId,
          batchId: batch.id,
          quantity: take,
        }),
      );

      await this.stockMutation.applyMovement(manager, {
        tenantId,
        variantId,
        batchId: batch.id,
        type: StockMovementType.SALE,
        quantityDelta: -take,
        referenceType: "RetailSale",
        referenceId: saleId,
        actorUserId,
      });
    }
  }

  /** Not private — `RetailReturnService` reuses this exact view builder after processing a return, inside the same transaction. */
  async loadView(manager: EntityManager, saleId: string): Promise<RetailSaleView> {
    const sale = await manager.getRepository(RetailSale).findOne({
      where: { id: saleId },
      relations: { customer: true, soldBy: true, payment: true },
    });
    if (!sale) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Sale not found." });
    }
    const lines = await manager.getRepository(RetailSaleLine).find({ where: { saleId }, order: { createdAt: "ASC" } });
    const returnedByLine = await this.returnedQuantitiesByLine(
      manager,
      lines.map((l) => l.id),
    );

    return {
      id: sale.id,
      customer: {
        id: sale.customer.id,
        name: `${sale.customer.firstName} ${sale.customer.lastName}`.trim(),
        phone: sale.customer.phone,
        isWalkIn: sale.customer.isWalkInPlaceholder,
      },
      subtotalCents: sale.subtotalCents,
      totalCents: sale.totalCents,
      status: sale.status,
      soldByName: sale.soldBy?.name ?? null,
      paymentId: sale.paymentId,
      paymentMethod: sale.payment?.method ?? null,
      lines: lines.map((l) => ({
        id: l.id,
        variantId: l.variantId,
        bundleId: l.bundleId,
        nameSnapshot: l.nameSnapshot,
        skuSnapshot: l.skuSnapshot,
        attributeSnapshot: l.attributeSnapshot,
        quantity: l.quantity,
        unitPriceCentsSnapshot: l.unitPriceCentsSnapshot,
        unitCostCentsSnapshot: l.unitCostCentsSnapshot,
        lineTotalCents: l.lineTotalCents,
        returnedQuantity: returnedByLine.get(l.id) ?? 0,
        isCustom: l.variantId === null && l.bundleId === null,
        convertedToVariantId: l.convertedToVariantId,
      })),
      createdAt: sale.createdAt,
    };
  }

  private async returnedQuantitiesByLine(manager: EntityManager, saleLineIds: string[]): Promise<Map<string, number>> {
    if (saleLineIds.length === 0) {
      return new Map();
    }
    const rows = await manager
      .getRepository(RetailReturnLine)
      .createQueryBuilder("rl")
      .select('rl."saleLineId"', "saleLineId")
      .addSelect("SUM(rl.quantity)::int", "quantity")
      .where('rl."saleLineId" IN (:...ids)', { ids: saleLineIds })
      .groupBy('rl."saleLineId"')
      .getRawMany<{ saleLineId: string; quantity: number }>();
    return new Map(rows.map((r) => [r.saleLineId, Number(r.quantity)]));
  }
}
