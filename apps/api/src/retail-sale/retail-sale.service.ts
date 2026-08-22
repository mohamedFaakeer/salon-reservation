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
import { Payment } from "../entities/payment.entity";
import { Product } from "../entities/product.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { RetailSaleView } from "./retail-sale.types";
// StockMutationService/CustomerService/AuditService must stay VALUE
// imports: NestJS resolves constructor injection via design:paramtypes
// metadata at runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "../inventory/stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "../customer/customer.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

const SELLABLE_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD_CAPTURED,
];

interface BatchAllocation {
  batch: StockBatch;
  quantity: number;
}

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
    private readonly customers: CustomerService,
    private readonly stockMutation: StockMutationService,
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

      // Lock every variant and price the cart before writing anything —
      // pricing is always the server's current priceCents, never trusted
      // from the client.
      const priced: Array<{ variant: ProductVariant; quantity: number; lineTotalCents: number }> = [];
      let subtotalCents = 0;
      for (const lineDto of dto.lines) {
        const variant = await this.stockMutation.lockVariant(manager, tenant.id, lineDto.variantId);
        if (!variant.active) {
          throw new ApiError({
            statusCode: 409,
            code: "PRODUCT_VARIANT_INACTIVE",
            message: `${variant.sku} is no longer sold.`,
          });
        }
        const lineTotalCents = variant.priceCents * lineDto.quantity;
        subtotalCents += lineTotalCents;
        priced.push({ variant, quantity: lineDto.quantity, lineTotalCents });
      }
      // Phase A: no bill-level discount on retail sales — see DECISIONS.md.
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

      for (const { variant, quantity, lineTotalCents } of priced) {
        const product = await this.products.findOne({ where: { id: variant.productId, tenantId: tenant.id } });
        const line = await manager.getRepository(RetailSaleLine).save(
          manager.getRepository(RetailSaleLine).create({
            saleId: sale.id,
            variantId: variant.id,
            nameSnapshot: product?.name ?? variant.sku,
            skuSnapshot: variant.sku,
            quantity,
            unitPriceCentsSnapshot: variant.priceCents,
            unitCostCentsSnapshot: variant.weightedAvgCostCents,
            lineTotalCents,
          }),
        );

        const allocations = await this.allocateBatches(manager, tenant.id, variant.id, quantity);
        for (const { batch, quantity: take } of allocations) {
          batch.quantityRemaining -= take;
          if (batch.quantityRemaining <= 0) {
            batch.quantityRemaining = 0;
            batch.status = StockBatchStatus.DEPLETED;
          }
          await manager.getRepository(StockBatch).save(batch);

          await manager.getRepository(RetailSaleLineBatch).save(
            manager.getRepository(RetailSaleLineBatch).create({
              saleLineId: line.id,
              batchId: batch.id,
              quantity: take,
            }),
          );

          await this.stockMutation.applyMovement(manager, {
            tenantId: tenant.id,
            variantId: variant.id,
            batchId: batch.id,
            type: StockMovementType.SALE,
            quantityDelta: -take,
            referenceType: "RetailSale",
            referenceId: sale.id,
            actorUserId,
          });
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
   * FIFO by `expiresAt` (nulls-last), then by receipt date — oldest-expiring
   * stock sells first. Separate from costing, which always snapshots the
   * variant's current weighted-average cost regardless of which batch the
   * units physically came from. A batch past its own `expiresAt` would
   * still match this query (nothing here checks "today"): expiry write-off
   * is a manual adjustment, not something checkout silently skips.
   */
  private async allocateBatches(
    manager: EntityManager,
    tenantId: string,
    variantId: string,
    quantity: number,
  ): Promise<BatchAllocation[]> {
    const batches = await manager
      .getRepository(StockBatch)
      .createQueryBuilder("b")
      .setLock("pessimistic_write")
      .where("b.tenantId = :tenantId AND b.variantId = :variantId AND b.status = :active AND b.quantityRemaining > 0", {
        tenantId,
        variantId,
        active: StockBatchStatus.ACTIVE,
      })
      .orderBy("b.expiresAt", "ASC", "NULLS LAST")
      .addOrderBy("b.createdAt", "ASC")
      .getMany();

    const allocations: BatchAllocation[] = [];
    let remaining = quantity;
    for (const batch of batches) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(batch.quantityRemaining, remaining);
      allocations.push({ batch, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new ApiError({
        statusCode: 409,
        code: "INSUFFICIENT_STOCK",
        message: "Not enough stock on hand to fulfil this line.",
      });
    }

    return allocations;
  }

  private async loadView(manager: EntityManager, saleId: string): Promise<RetailSaleView> {
    const sale = await manager.getRepository(RetailSale).findOne({
      where: { id: saleId },
      relations: { customer: true, soldBy: true },
    });
    if (!sale) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Sale not found." });
    }
    const lines = await manager.getRepository(RetailSaleLine).find({ where: { saleId }, order: { createdAt: "ASC" } });

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
      lines: lines.map((l) => ({
        id: l.id,
        variantId: l.variantId,
        nameSnapshot: l.nameSnapshot,
        skuSnapshot: l.skuSnapshot,
        quantity: l.quantity,
        unitPriceCentsSnapshot: l.unitPriceCentsSnapshot,
        unitCostCentsSnapshot: l.unitCostCentsSnapshot,
        lineTotalCents: l.lineTotalCents,
      })),
      createdAt: sale.createdAt,
    };
  }
}
