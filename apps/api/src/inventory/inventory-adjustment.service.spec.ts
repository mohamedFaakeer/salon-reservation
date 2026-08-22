import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { StockMovementType } from "@salon/shared";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";
import type { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { StockMutationService } from "./stock-mutation.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeBatch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: "batch-1",
    tenantId: "tenant-1",
    variantId: "variant-1",
    quantityReceived: 20,
    quantityRemaining: 10,
    status: "ACTIVE",
    ...overrides,
  } as StockBatch;
}

describe("InventoryAdjustmentService", () => {
  let dataSource: DataSource;
  let stockMutation: StockMutationService;
  let audit: AuditService;
  let service: InventoryAdjustmentService;
  let queryBuilderGetOne: ReturnType<typeof vi.fn>;
  let batchRepo: Repository<StockBatch>;

  beforeEach(() => {
    batchRepo = mockRepo<StockBatch>();
    queryBuilderGetOne = vi.fn(async () => fakeBatch());

    const queryBuilder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: queryBuilderGetOne,
    };

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === StockBatch) return { ...batchRepo, createQueryBuilder: vi.fn(() => queryBuilder) };
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    stockMutation = {
      lockVariant: vi.fn(async () => ({ id: "variant-1", tenantId: "tenant-1", sku: "SHMP-400" }) as ProductVariant),
      applyMovement: vi.fn(async () => ({ id: "variant-1", quantityOnHand: 7 }) as ProductVariant),
    } as unknown as StockMutationService;

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new InventoryAdjustmentService(dataSource, stockMutation, audit);
  });

  it("applies a variant-level adjustment with no batch, through StockMutationService", async () => {
    await service.adjust(
      "tenant-1",
      { variantId: "variant-1", quantityDelta: -3, type: StockMovementType.ADJUSTMENT, reason: "stock take shortfall" },
      "user-1",
    );

    expect(stockMutation.applyMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ variantId: "variant-1", quantityDelta: -3, reason: "stock take shortfall" }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STOCK_ADJUSTED" }),
      expect.anything(),
    );
  });

  it("adjusts a specific batch's remaining quantity and depletes it at zero", async () => {
    queryBuilderGetOne.mockResolvedValueOnce(fakeBatch({ quantityRemaining: 2 }));

    await service.adjust(
      "tenant-1",
      { variantId: "variant-1", batchId: "batch-1", quantityDelta: -2, type: StockMovementType.WRITE_OFF, reason: "breakage" },
      "user-1",
    );

    const saved = vi.mocked(batchRepo.save).mock.calls[0][0] as StockBatch;
    expect(saved.quantityRemaining).toBe(0);
  });

  it("refuses an adjustment that would push a batch's remaining quantity negative", async () => {
    queryBuilderGetOne.mockResolvedValueOnce(fakeBatch({ quantityRemaining: 1 }));

    await expect(
      service.adjust(
        "tenant-1",
        { variantId: "variant-1", batchId: "batch-1", quantityDelta: -5, type: StockMovementType.WRITE_OFF, reason: "breakage" },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_ADJUSTMENT" });
  });

  it("refuses an adjustment that would push a batch's remaining quantity above what was received", async () => {
    queryBuilderGetOne.mockResolvedValueOnce(fakeBatch({ quantityReceived: 20, quantityRemaining: 18 }));

    await expect(
      service.adjust(
        "tenant-1",
        { variantId: "variant-1", batchId: "batch-1", quantityDelta: 5, type: StockMovementType.ADJUSTMENT, reason: "found stock" },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_ADJUSTMENT" });
  });

  it("404s when the named batch does not belong to this tenant/variant", async () => {
    queryBuilderGetOne.mockResolvedValueOnce(null);

    await expect(
      service.adjust(
        "tenant-1",
        { variantId: "variant-1", batchId: "missing", quantityDelta: -1, type: StockMovementType.WRITE_OFF, reason: "breakage" },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "STOCK_BATCH_NOT_FOUND" });
  });
});
