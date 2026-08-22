import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { ApiError, StockBatchStatus, StockMovementType, type CreateStockAdjustmentDto } from "@salon/shared";
import type { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
// StockMutationService/AuditService must stay VALUE imports: NestJS
// resolves constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockMutationService } from "./stock-mutation.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

/**
 * A manual correction outside the sale/receipt path — a stock take finding
 * fewer units than the system thinks, breakage, theft, or found stock.
 * Always requires a reason (enforced by `CreateStockAdjustmentDto`), and
 * always writes through `StockMutationService` so it lands in the same
 * append-only ledger a sale or a receipt does.
 */
@Injectable()
export class InventoryAdjustmentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockMutation: StockMutationService,
    private readonly audit: AuditService,
  ) {}

  async adjust(tenantId: string, dto: CreateStockAdjustmentDto, actorUserId: string): Promise<ProductVariant> {
    return this.dataSource.transaction(async (manager) => {
      const variant = await this.stockMutation.lockVariant(manager, tenantId, dto.variantId);

      if (dto.batchId) {
        const batch = await manager
          .getRepository(StockBatch)
          .createQueryBuilder("b")
          .setLock("pessimistic_write")
          .where("b.tenantId = :tenantId AND b.id = :batchId AND b.variantId = :variantId", {
            tenantId,
            batchId: dto.batchId,
            variantId: dto.variantId,
          })
          .getOne();
        if (!batch) {
          throw new ApiError({ statusCode: 404, code: "STOCK_BATCH_NOT_FOUND", message: "That stock batch does not exist." });
        }
        const newRemaining = batch.quantityRemaining + dto.quantityDelta;
        if (newRemaining < 0 || newRemaining > batch.quantityReceived) {
          throw new ApiError({
            statusCode: 409,
            code: "INVALID_ADJUSTMENT",
            message: `This batch has ${batch.quantityRemaining} remaining of ${batch.quantityReceived} received — that adjustment doesn't fit.`,
          });
        }
        batch.quantityRemaining = newRemaining;
        if (newRemaining === 0 && batch.status === StockBatchStatus.ACTIVE) {
          batch.status = StockBatchStatus.DEPLETED;
        } else if (dto.type === StockMovementType.WRITE_OFF && newRemaining === 0) {
          batch.status = StockBatchStatus.WRITTEN_OFF;
        }
        await manager.getRepository(StockBatch).save(batch);
      }

      const updated = await this.stockMutation.applyMovement(manager, {
        tenantId,
        variantId: variant.id,
        batchId: dto.batchId ?? null,
        type: dto.type,
        quantityDelta: dto.quantityDelta,
        reason: dto.reason.trim(),
        actorUserId,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "STOCK_ADJUSTED",
          entityType: "ProductVariant",
          entityId: variant.id,
          metadata: { quantityDelta: dto.quantityDelta, type: dto.type, reason: dto.reason, batchId: dto.batchId ?? null },
        },
        manager,
      );

      return updated;
    });
  }
}
