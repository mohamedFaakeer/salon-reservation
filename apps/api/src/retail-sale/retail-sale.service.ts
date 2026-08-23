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
  type RetailSaleCheckoutDto,
  type RetailSaleQueryDto,
} from "@salon/shared";
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
import type { RetailSaleReceiptView, RetailSaleView } from "./retail-sale.types";
// StockMutationService/CustomerService/BundleService/AuditService must stay
// VALUE imports: NestJS resolves constructor injection via design:paramtypes
// metadata at runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "../inventory/stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "../customer/customer.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BundleService } from "../bundle/bundle.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

const SELLABLE_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD_CAPTURED,
];

type ResolvedLine =
  | { kind: "variant"; variant: ProductVariant; quantity: number }
  | {
      kind: "bundle";
      bundle: ProductBundle;
      components: Array<{ component: ProductBundleComponent; variant: ProductVariant }>;
      quantity: number;
    };

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
        message: "Choose cash, bank transfer or card for how this sale was paid for.",
      });
    }
    for (const line of dto.lines) {
      if (Boolean(line.variantId) === Boolean(line.bundleId)) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Each cart line needs exactly one of variantId or bundleId.",
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
        } else {
          for (const c of bundleData.get(line.bundleId!)!.components) {
            variantIds.add(c.variantId);
          }
        }
      }
      const lockedVariants = new Map<string, ProductVariant>();
      for (const variantId of [...variantIds].sort()) {
        lockedVariants.set(variantId, await this.stockMutation.lockVariant(manager, tenant.id, variantId));
      }

      // Price every line from the locked snapshot — never from the client.
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
        } else {
          const data = bundleData.get(line.bundleId!)!;
          const components = data.components.map((component) => ({
            component,
            variant: lockedVariants.get(component.variantId)!,
          }));
          subtotalCents += data.bundle.priceCents * line.quantity;
          resolved.push({ kind: "bundle", bundle: data.bundle, components, quantity: line.quantity });
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
              quantity: line.quantity,
              unitPriceCentsSnapshot: line.variant.priceCents,
              unitCostCentsSnapshot: line.variant.weightedAvgCostCents,
              lineTotalCents,
            }),
          );
          await this.allocateAndDraw(manager, tenant.id, sale.id, saleLine.id, line.variant.id, line.quantity, actorUserId);
        } else {
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
              quantity: line.quantity,
              unitPriceCentsSnapshot: line.bundle.priceCents,
              unitCostCentsSnapshot,
              lineTotalCents,
            }),
          );
          for (const c of line.components) {
            const neededQty = c.component.quantityPerBundle * line.quantity;
            await this.allocateAndDraw(manager, tenant.id, sale.id, saleLine.id, c.variant.id, neededQty, actorUserId);
          }
        }
      }

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "RETAIL_SALE_COMPLETED",
          entityType: "RetailSale",
          entityId: sale.id,
          metadata: { totalCents, lineCount: dto.lines.length, walkIn: !dto.customer },
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
   * `saleId` is the only credential; deliberately trimmed to receipt-shaped
   * facts (see `RetailSaleReceiptView`'s own doc comment).
   */
  async getPublicReceipt(saleId: string): Promise<RetailSaleReceiptView> {
    const sale = await this.sales.findOne({
      where: { id: saleId },
      relations: { customer: true, soldBy: true, payment: true, tenant: true },
    });
    if (!sale) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Receipt not found." });
    }
    const branch = await this.branches.findOne({ where: { tenantId: sale.tenantId } });
    const lines = await this.sales.manager.getRepository(RetailSaleLine).find({ where: { saleId }, order: { createdAt: "ASC" } });

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
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
      })),
      subtotalCents: sale.subtotalCents,
      totalCents: sale.totalCents,
    };
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
        quantity: l.quantity,
        unitPriceCentsSnapshot: l.unitPriceCentsSnapshot,
        unitCostCentsSnapshot: l.unitCostCentsSnapshot,
        lineTotalCents: l.lineTotalCents,
        returnedQuantity: returnedByLine.get(l.id) ?? 0,
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
