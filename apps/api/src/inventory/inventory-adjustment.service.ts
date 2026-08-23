import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, StockBatchStatus, StockMovementType, type CreateStockAdjustmentDto } from "@salon/shared";
import { Product } from "../entities/product.entity";
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
 *
 * Whichever branch runs, `quantityOnHand` and `sum(batch.quantityRemaining)`
 * come out equal — the invariant `RetailSaleService.allocateAndDraw` relies
 * on to sell what the Stock screen says is there. A batch-less positive
 * delta with no tracked batch to grow would otherwise inflate `quantityOnHand`
 * with nothing sellable behind it, which is exactly the bug this guards.
 */
@Injectable()
export class InventoryAdjustmentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly stockMutation: StockMutationService,
    private readonly audit: AuditService,
  ) {}

  async adjust(tenantId: string, dto: CreateStockAdjustmentDto, actorUserId: string): Promise<ProductVariant> {
    return this.dataSource.transaction(async (manager) => {
      const variant = await this.stockMutation.lockVariant(manager, tenantId, dto.variantId);
      let updated: ProductVariant;

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

        updated = await this.stockMutation.applyMovement(manager, {
          tenantId,
          variantId: variant.id,
          batchId: dto.batchId,
          type: dto.type,
          quantityDelta: dto.quantityDelta,
          reason: dto.reason.trim(),
          actorUserId,
        });
      } else if (dto.quantityDelta > 0) {
        // "Found stock" with no batch named — the only way to grow
        // `quantityOnHand` without one is to open a new batch for it. A
        // product that tracks expiry/serials can't get a safe default for
        // either, so that case is refused in favour of Receive stock, which
        // collects the real data.
        const product = await this.products.findOne({ where: { id: variant.productId, tenantId } });
        if (!product) {
          throw new ApiError({ statusCode: 404, code: "PRODUCT_NOT_FOUND", message: "Product not found." });
        }
        if (product.tracksExpiry || product.trackSerial) {
          throw new ApiError({
            statusCode: 400,
            code: "ADJUSTMENT_BATCH_REQUIRED",
            message: `${product.name} tracks ${product.tracksExpiry ? "expiry dates" : "serial numbers"} — use Receive stock to add new stock so it's recorded on a proper batch.`,
          });
        }
        const batch = await manager.getRepository(StockBatch).save(
          manager.getRepository(StockBatch).create({
            tenantId,
            variantId: variant.id,
            receiptId: null,
            lotCode: null,
            expiresAt: null,
            serialNumber: null,
            unitCostCents: variant.weightedAvgCostCents,
            quantityReceived: dto.quantityDelta,
            quantityRemaining: dto.quantityDelta,
            status: StockBatchStatus.ACTIVE,
          }),
        );
        updated = await this.stockMutation.applyMovement(manager, {
          tenantId,
          variantId: variant.id,
          batchId: batch.id,
          type: dto.type,
          quantityDelta: dto.quantityDelta,
          reason: dto.reason.trim(),
          actorUserId,
        });
      } else if (dto.quantityDelta < 0) {
        // Shrinkage with no specific batch named — drawn down oldest-first
        // across active batches, the same order a sale would draw from, so
        // this never leaves `quantityOnHand` understating what's really
        // sellable.
        const allocations = await this.stockMutation.allocateFifo(manager, tenantId, dto.variantId, -dto.quantityDelta);
        updated = variant;
        for (const { batch, quantity: take } of allocations) {
          batch.quantityRemaining -= take;
          if (batch.quantityRemaining <= 0) {
            batch.quantityRemaining = 0;
            batch.status = dto.type === StockMovementType.WRITE_OFF ? StockBatchStatus.WRITTEN_OFF : StockBatchStatus.DEPLETED;
          }
          await manager.getRepository(StockBatch).save(batch);
          updated = await this.stockMutation.applyMovement(manager, {
            tenantId,
            variantId: variant.id,
            batchId: batch.id,
            type: dto.type,
            quantityDelta: -take,
            reason: dto.reason.trim(),
            actorUserId,
          });
        }
      } else {
        // quantityDelta === 0 with no batch named: nothing to allocate, just a reason on the record.
        updated = await this.stockMutation.applyMovement(manager, {
          tenantId,
          variantId: variant.id,
          batchId: null,
          type: dto.type,
          quantityDelta: 0,
          reason: dto.reason.trim(),
          actorUserId,
        });
      }

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
