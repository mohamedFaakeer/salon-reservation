import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, StockBatchStatus, StockMovementType, type CreateStockReceiptDto } from "@salon/shared";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { StockReceipt } from "../entities/stock-receipt.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
// StockMutationService/AuditService must stay VALUE imports: NestJS
// resolves constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "./stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

/**
 * Receiving stock. Deliberately not a purchase-order workflow — CLAUDE.md
 * keeps "purchases" out of scope — so this is one manual action: name a
 * supplier (free text), list what came in, done. Every batch line recomputes
 * the variant's weighted-average cost and writes a RECEIPT movement through
 * `StockMutationService`, all inside one transaction per receipt.
 */
@Injectable()
export class StockReceiptService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly stockMutation: StockMutationService,
    private readonly audit: AuditService,
  ) {}

  async receive(tenantId: string, dto: CreateStockReceiptDto, actorUserId: string): Promise<StockReceipt> {
    return this.dataSource.transaction(async (manager) => {
      const receiptRepo = manager.getRepository(StockReceipt);
      const receipt = await receiptRepo.save(
        receiptRepo.create({
          tenantId,
          supplierName: dto.supplierName?.trim() || null,
          referenceNote: dto.referenceNote?.trim() || null,
          receivedById: actorUserId,
          receivedAt: new Date(),
          totalCostCents: 0,
        }),
      );

      let totalCostCents = 0;

      for (const line of dto.batches) {
        const variant = await this.stockMutation.lockVariant(manager, tenantId, line.variantId);
        const product = await this.products.findOne({ where: { id: variant.productId, tenantId } });
        if (!product) {
          throw new ApiError({ statusCode: 404, code: "PRODUCT_NOT_FOUND", message: "Product not found." });
        }
        if (product.tracksExpiry && !line.expiresAt) {
          throw new ApiError({
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: `${product.name} tracks expiry — every batch needs an expiry date.`,
          });
        }
        if (product.trackSerial) {
          if (!line.serialNumber) {
            throw new ApiError({
              statusCode: 400,
              code: "VALIDATION_ERROR",
              message: `${product.name} tracks serial numbers — every unit needs one.`,
            });
          }
          if (line.quantity !== 1) {
            throw new ApiError({
              statusCode: 400,
              code: "VALIDATION_ERROR",
              message: "A serialised product must be received one unit per batch line.",
            });
          }
        }

        // Weighted average recomputed from the variant's state *before* this
        // batch's own quantity/cost are folded in.
        const priorOnHand = variant.quantityOnHand;
        const priorAvg = variant.weightedAvgCostCents;
        const newOnHand = priorOnHand + line.quantity;
        const newAvgCostCents =
          newOnHand === 0 ? line.unitCostCents : Math.round((priorOnHand * priorAvg + line.quantity * line.unitCostCents) / newOnHand);
        variant.weightedAvgCostCents = newAvgCostCents;
        await manager.getRepository(ProductVariant).save(variant);

        let batch: StockBatch;
        try {
          batch = await manager.getRepository(StockBatch).save(
            manager.getRepository(StockBatch).create({
              tenantId,
              variantId: variant.id,
              receiptId: receipt.id,
              lotCode: line.lotCode?.trim() || null,
              expiresAt: line.expiresAt ?? null,
              serialNumber: line.serialNumber?.trim() || null,
              unitCostCents: line.unitCostCents,
              quantityReceived: line.quantity,
              quantityRemaining: line.quantity,
              status: StockBatchStatus.ACTIVE,
            }),
          );
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw new ApiError({
              statusCode: 409,
              code: "DUPLICATE_SERIAL",
              message: `Serial ${line.serialNumber} is already on file.`,
            });
          }
          throw err;
        }

        await this.stockMutation.applyMovement(manager, {
          tenantId,
          variantId: variant.id,
          batchId: batch.id,
          type: StockMovementType.RECEIPT,
          quantityDelta: line.quantity,
          referenceType: "StockReceipt",
          referenceId: receipt.id,
          actorUserId,
        });

        totalCostCents += line.quantity * line.unitCostCents;
      }

      receipt.totalCostCents = totalCostCents;
      await receiptRepo.save(receipt);

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "STOCK_RECEIPT_RECORDED",
          entityType: "StockReceipt",
          entityId: receipt.id,
          metadata: { batchCount: dto.batches.length, totalCostCents, supplierName: receipt.supplierName },
        },
        manager,
      );

      return receipt;
    });
  }
}
