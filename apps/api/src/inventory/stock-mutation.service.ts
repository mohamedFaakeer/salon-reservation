import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { ApiError, StockBatchStatus, StockMovementType } from "@salon/shared";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { StockMovement } from "../entities/stock-movement.entity";

export interface OpenBatchInput {
  tenantId: string;
  variantId: string;
  quantity: number;
  unitCostCents: number;
  lotCode?: string | null;
  expiresAt?: string | null;
  serialNumber?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId: string | null;
}

export interface BatchAllocation {
  batch: StockBatch;
  quantity: number;
}

export interface ApplyMovementInput {
  tenantId: string;
  variantId: string;
  /** Set for a movement that draws from (or restocks) one specific lot/serial; null for a pure variant-level correction. */
  batchId?: string | null;
  type: StockMovementType;
  /** Signed: positive grows `quantityOnHand`, negative shrinks it. */
  quantityDelta: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  actorUserId: string | null;
}

/**
 * The one place a `stock_movement` row is ever created and `ProductVariant
 * .quantityOnHand` is ever mutated — this module's equivalent of
 * `PaymentService.recordPaymentInternal`. Called by `StockReceiptService`
 * (receiving), `RetailSaleService` (selling), and `InventoryAdjustmentService`
 * (manual correction), always inside the caller's own transaction so the
 * ledger row and the running total are always written atomically together.
 *
 * `lockVariant` takes a `pessimistic_write` row lock before any read a
 * caller acts on — this is the module's core guarantee that two
 * receptionists cannot both sell the same last unit: whichever transaction
 * gets the lock first sees the true current quantity, and the loser blocks
 * until the winner commits (or rolls back and retries against fresh data).
 */
@Injectable()
export class StockMutationService {
  async lockVariant(manager: EntityManager, tenantId: string, variantId: string): Promise<ProductVariant> {
    const variant = await manager
      .getRepository(ProductVariant)
      .createQueryBuilder("v")
      .setLock("pessimistic_write")
      .where("v.tenantId = :tenantId AND v.id = :variantId", { tenantId, variantId })
      .getOne();
    if (!variant) {
      throw new ApiError({
        statusCode: 404,
        code: "PRODUCT_VARIANT_NOT_FOUND",
        message: "That product variant does not exist.",
      });
    }
    return variant;
  }

  /**
   * Re-locks the variant (cheap and safe to call again inside the same
   * transaction — Postgres re-acquiring a lock its own session already
   * holds never blocks or deadlocks), applies the delta, and writes the
   * ledger row. Refuses outright rather than clamping when a negative delta
   * would take `quantityOnHand` below zero — the `CHK_product_variant_qty_nonneg`
   * constraint is the last-resort guarantee, this is the first one.
   */
  async applyMovement(manager: EntityManager, input: ApplyMovementInput): Promise<ProductVariant> {
    const variant = await this.lockVariant(manager, input.tenantId, input.variantId);
    const quantityAfter = variant.quantityOnHand + input.quantityDelta;
    if (quantityAfter < 0) {
      throw new ApiError({
        statusCode: 409,
        code: "INSUFFICIENT_STOCK",
        message: `Only ${variant.quantityOnHand} of ${variant.sku} left in stock.`,
      });
    }

    variant.quantityOnHand = quantityAfter;
    await manager.getRepository(ProductVariant).save(variant);

    await manager.getRepository(StockMovement).save(
      manager.getRepository(StockMovement).create({
        tenantId: input.tenantId,
        variantId: variant.id,
        batchId: input.batchId ?? null,
        type: input.type,
        quantityDelta: input.quantityDelta,
        quantityAfter,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        reason: input.reason ?? null,
        actorUserId: input.actorUserId,
      }),
    );

    return variant;
  }

  /**
   * FIFO by `expiresAt` (nulls-last), then by receipt date — oldest-expiring
   * stock is drawn first. Shared by `RetailSaleService` (selling) and
   * `InventoryAdjustmentService` (a batch-agnostic shrinkage correction) so
   * both keep `quantityOnHand` in lockstep with `sum(batch.quantityRemaining)`
   * — the one invariant that makes a batch's `quantityRemaining` trustworthy.
   * Neither caller mutates the returned batches; that's on them, inside their
   * own transaction, right after this resolves.
   */
  async allocateFifo(manager: EntityManager, tenantId: string, variantId: string, quantity: number): Promise<BatchAllocation[]> {
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
        message: "Not enough stock on hand to cover this quantity.",
      });
    }

    return allocations;
  }

  /**
   * Opens a brand-new ACTIVE batch and records the RECEIPT movement that
   * puts it on hand — the shape "stock arrived with no prior batch to add
   * to" takes, whether that's a fresh variant's opening count or one row of
   * a bulk product import. `StockReceiptService` deliberately doesn't call
   * this: it also recomputes a variant's weighted-average cost across
   * *existing* stock, which a brand-new variant has none of.
   */
  async openBatch(manager: EntityManager, input: OpenBatchInput): Promise<ProductVariant> {
    const batch = await manager.getRepository(StockBatch).save(
      manager.getRepository(StockBatch).create({
        tenantId: input.tenantId,
        variantId: input.variantId,
        receiptId: null,
        lotCode: input.lotCode ?? null,
        expiresAt: input.expiresAt ?? null,
        serialNumber: input.serialNumber ?? null,
        unitCostCents: input.unitCostCents,
        quantityReceived: input.quantity,
        quantityRemaining: input.quantity,
        status: StockBatchStatus.ACTIVE,
      }),
    );
    return this.applyMovement(manager, {
      tenantId: input.tenantId,
      variantId: input.variantId,
      batchId: batch.id,
      type: StockMovementType.RECEIPT,
      quantityDelta: input.quantity,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorUserId: input.actorUserId,
    });
  }
}
