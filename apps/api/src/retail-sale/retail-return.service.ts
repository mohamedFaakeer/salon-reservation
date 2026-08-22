import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import { In } from "typeorm";
import {
  ApiError,
  RetailReturnDisposition,
  RetailSaleStatus,
  StockBatchStatus,
  StockMovementType,
  type CreateRetailReturnDto,
} from "@salon/shared";
import { Product } from "../entities/product.entity";
import { RetailReturn } from "../entities/retail-return.entity";
import { RetailReturnLine } from "../entities/retail-return-line.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { RetailSaleView } from "./retail-sale.types";
import type { RetailReturnView } from "./retail-return.types";
// StockMutationService/RetailSaleService/PaymentService/AuditService must
// stay VALUE imports: NestJS resolves constructor injection via
// design:paramtypes metadata at runtime; `import type` would erase them and
// break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "../inventory/stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RetailSaleService } from "./retail-sale.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentService } from "../payment/payment.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

/**
 * Restock or quarantine, per line, against a completed sale — with an
 * optional staff-entered refund through the same `PaymentService
 * .refundWithManager` path `BookingService.cancelAppointment` already uses.
 * Phase B scope: a bundle line (`RetailSaleLine.variantId === null`) can't
 * be returned yet — its component fan-out at return time is deferred.
 */
@Injectable()
export class RetailReturnService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockMutation: StockMutationService,
    private readonly retailSales: RetailSaleService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
  ) {}

  async process(
    tenant: Tenant,
    saleId: string,
    dto: CreateRetailReturnDto,
    actorUserId: string,
  ): Promise<RetailSaleView> {
    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.getRepository(RetailSale).findOne({ where: { id: saleId, tenantId: tenant.id } });
      if (!sale) {
        throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Sale not found." });
      }

      const returnRepo = manager.getRepository(RetailReturn);
      const returnRow = await returnRepo.save(
        returnRepo.create({
          tenantId: tenant.id,
          saleId: sale.id,
          processedById: actorUserId,
          reason: dto.reason.trim(),
          refundId: null,
          refundedCents: 0,
        }),
      );

      for (const lineDto of dto.lines) {
        const saleLine = await manager.getRepository(RetailSaleLine).findOne({ where: { id: lineDto.saleLineId, saleId: sale.id } });
        if (!saleLine) {
          throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "That line isn't part of this sale." });
        }
        if (saleLine.variantId === null) {
          throw new ApiError({
            statusCode: 409,
            code: "BUNDLE_RETURN_NOT_SUPPORTED",
            message: "Bundle lines can't be returned yet — return the sale's other lines, or contact support.",
          });
        }

        const alreadyReturned = await this.returnedQuantityFor(manager, saleLine.id);
        const remaining = saleLine.quantity - alreadyReturned;
        if (lineDto.quantity > remaining) {
          throw new ApiError({
            statusCode: 409,
            code: "RETURN_EXCEEDS_SALE_QUANTITY",
            message: `Only ${remaining} of ${saleLine.nameSnapshot} left to return on this line.`,
          });
        }

        const returnLineRepo = manager.getRepository(RetailReturnLine);
        await returnLineRepo.save(
          returnLineRepo.create({
            returnId: returnRow.id,
            saleLineId: saleLine.id,
            quantity: lineDto.quantity,
            disposition: lineDto.disposition,
          }),
        );

        if (lineDto.disposition === RetailReturnDisposition.RESTOCK) {
          await this.restock(manager, tenant.id, saleLine, lineDto, returnRow.id, actorUserId);
        }
        // QUARANTINE: no stock/batch mutation — the RetailReturnLine row above is the whole record. It never
        // re-enters quantityOnHand, because it isn't sellable.
      }

      if (dto.refundCents && dto.refundCents > 0) {
        if (!sale.paymentId) {
          throw new ApiError({ statusCode: 409, code: "NO_PAYMENT_TO_REFUND", message: "This sale has no payment on record to refund." });
        }
        const refund = await this.payments.refundWithManager(
          manager,
          tenant,
          sale.paymentId,
          { amountCents: dto.refundCents, reason: dto.reason.trim() },
          actorUserId,
        );
        returnRow.refundId = refund.id;
        returnRow.refundedCents = dto.refundCents;
        await returnRepo.save(returnRow);
      }

      await this.recomputeSaleStatus(manager, sale);

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "RETAIL_RETURN_PROCESSED",
          entityType: "RetailReturn",
          entityId: returnRow.id,
          metadata: { saleId: sale.id, refundCents: dto.refundCents ?? 0, lineCount: dto.lines.length },
        },
        manager,
      );

      return this.retailSales.loadView(manager, sale.id);
    });
  }

  async listForSale(tenantId: string, saleId: string): Promise<RetailReturnView[]> {
    const manager = this.dataSource.manager;
    const sale = await manager.getRepository(RetailSale).findOne({ where: { id: saleId, tenantId } });
    if (!sale) {
      throw new ApiError({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND", message: "Sale not found." });
    }
    const returns = await manager.getRepository(RetailReturn).find({
      where: { saleId },
      relations: { processedBy: true },
      order: { createdAt: "DESC" },
    });
    if (returns.length === 0) {
      return [];
    }
    const lines = await manager
      .getRepository(RetailReturnLine)
      .find({ where: { returnId: In(returns.map((r) => r.id)) } });

    return returns.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      processedByName: r.processedBy?.name ?? null,
      reason: r.reason,
      refundedCents: r.refundedCents,
      lines: lines
        .filter((l) => l.returnId === r.id)
        .map((l) => ({ id: l.id, saleLineId: l.saleLineId, quantity: l.quantity, disposition: l.disposition })),
      createdAt: r.createdAt,
    }));
  }

  /**
   * Lot-tracked/untracked products always get a fresh batch, at the
   * original sale line's own cost snapshot — simple, and always structurally
   * valid regardless of what happened to stock since. A serialised product
   * instead reactivates its exact original batch (found by the serial staff
   * re-enters): a fresh batch would collide with the still-on-file original
   * serial's unique index.
   */
  private async restock(
    manager: EntityManager,
    tenantId: string,
    saleLine: RetailSaleLine,
    lineDto: CreateRetailReturnDto["lines"][number],
    returnId: string,
    actorUserId: string,
  ): Promise<void> {
    const variant = await this.stockMutation.lockVariant(manager, tenantId, saleLine.variantId!);
    const product = await manager.getRepository(Product).findOne({ where: { id: variant.productId, tenantId } });

    let batch: StockBatch;
    if (product?.trackSerial) {
      if (!lineDto.serialNumber?.trim()) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: `${product.name} tracks serial numbers — the serial being restocked is required.`,
        });
      }
      if (lineDto.quantity !== 1) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "A serialised product restocks one unit at a time.",
        });
      }
      const existing = await manager
        .getRepository(StockBatch)
        .findOne({ where: { tenantId, variantId: variant.id, serialNumber: lineDto.serialNumber.trim() } });
      if (!existing) {
        throw new ApiError({ statusCode: 404, code: "STOCK_BATCH_NOT_FOUND", message: "No stock batch on file with that serial." });
      }
      const drawnFromThisLine = await manager
        .getRepository(RetailSaleLineBatch)
        .findOne({ where: { saleLineId: saleLine.id, batchId: existing.id } });
      if (!drawnFromThisLine) {
        throw new ApiError({
          statusCode: 409,
          code: "SERIAL_NOT_FROM_THIS_SALE",
          message: "That serial wasn't part of this sale line.",
        });
      }
      if (existing.quantityRemaining !== 0) {
        throw new ApiError({
          statusCode: 409,
          code: "ALREADY_IN_STOCK",
          message: "That unit is already back in stock.",
        });
      }
      existing.quantityRemaining = 1;
      existing.status = StockBatchStatus.ACTIVE;
      batch = await manager.getRepository(StockBatch).save(existing);
    } else {
      if (product?.tracksExpiry && !lineDto.expiresAt) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: `${product.name} tracks expiry — an expiry date is required to restock it.`,
        });
      }
      batch = await manager.getRepository(StockBatch).save(
        manager.getRepository(StockBatch).create({
          tenantId,
          variantId: variant.id,
          receiptId: null,
          lotCode: lineDto.lotCode?.trim() || null,
          expiresAt: lineDto.expiresAt ?? null,
          serialNumber: null,
          unitCostCents: saleLine.unitCostCentsSnapshot,
          quantityReceived: lineDto.quantity,
          quantityRemaining: lineDto.quantity,
          status: StockBatchStatus.ACTIVE,
        }),
      );
    }

    await this.stockMutation.applyMovement(manager, {
      tenantId,
      variantId: variant.id,
      batchId: batch.id,
      type: StockMovementType.RETURN_RESTOCK,
      quantityDelta: lineDto.quantity,
      referenceType: "RetailReturn",
      referenceId: returnId,
      actorUserId,
    });
  }

  private async returnedQuantityFor(manager: EntityManager, saleLineId: string): Promise<number> {
    const rows = await manager.getRepository(RetailReturnLine).find({ where: { saleLineId } });
    return rows.reduce((sum, r) => sum + r.quantity, 0);
  }

  private async recomputeSaleStatus(manager: EntityManager, sale: RetailSale): Promise<void> {
    const lines = await manager.getRepository(RetailSaleLine).find({ where: { saleId: sale.id } });
    const returned = await Promise.all(
      lines.map(async (line) => ({ line, returnedQuantity: await this.returnedQuantityFor(manager, line.id) })),
    );
    const allFullyReturned = returned.every((r) => r.returnedQuantity >= r.line.quantity);
    const anyReturned = returned.some((r) => r.returnedQuantity > 0);
    sale.status = allFullyReturned
      ? RetailSaleStatus.RETURNED
      : anyReturned
        ? RetailSaleStatus.PARTIALLY_RETURNED
        : sale.status;
    await manager.getRepository(RetailSale).save(sale);
  }
}
