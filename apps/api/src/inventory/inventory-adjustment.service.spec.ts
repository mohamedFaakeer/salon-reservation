import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { StockMovementType } from "@salon/shared";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";
import { StockMutationService } from "./stock-mutation.service";
import type { Product } from "../entities/product.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
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

function fakeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    tenantId: "tenant-1",
    name: "Sunsilk Black Shine Shampoo",
    tracksExpiry: false,
    trackSerial: false,
    ...overrides,
  } as Product;
}

describe("InventoryAdjustmentService", () => {
  let dataSource: DataSource;
  let stockMutation: StockMutationService;
  let audit: AuditService;
  let service: InventoryAdjustmentService;
  let queryBuilderGetOne: ReturnType<typeof vi.fn>;
  let queryBuilderGetMany: ReturnType<typeof vi.fn>;
  let batchRepo: Repository<StockBatch>;
  let productsRepo: Repository<Product>;

  beforeEach(() => {
    batchRepo = mockRepo<StockBatch>();
    vi.mocked(batchRepo.save).mockImplementation(async (e) => ({ ...e, id: e.id ?? "new-batch-1" }) as StockBatch);
    productsRepo = mockRepo<Product>();
    vi.mocked(productsRepo.findOne).mockImplementation(async () => fakeProduct());
    queryBuilderGetOne = vi.fn(async () => fakeBatch());
    queryBuilderGetMany = vi.fn(async () => [fakeBatch()]);

    const queryBuilder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getOne: queryBuilderGetOne,
      getMany: queryBuilderGetMany,
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

    // A real instance, not a full mock: `allocateFifo` is left as the real
    // implementation so a batch-less shrinkage exercises the same query path
    // `RetailSaleService` does — only `lockVariant`/`applyMovement` are stubbed.
    stockMutation = new StockMutationService();
    vi.spyOn(stockMutation, "lockVariant").mockImplementation(
      async () => ({ id: "variant-1", tenantId: "tenant-1", productId: "product-1", sku: "SHMP-400", weightedAvgCostCents: 250 }) as ProductVariant,
    );
    vi.spyOn(stockMutation, "applyMovement").mockImplementation(async () => ({ id: "variant-1", quantityOnHand: 7 }) as ProductVariant);

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new InventoryAdjustmentService(dataSource, productsRepo, stockMutation, audit);
  });

  it("draws down active batches oldest-first for a batch-less shrinkage, keeping quantityOnHand in step with batches", async () => {
    queryBuilderGetMany.mockResolvedValueOnce([fakeBatch({ id: "batch-early", quantityRemaining: 2 }), fakeBatch({ id: "batch-late", quantityRemaining: 5 })]);

    await service.adjust(
      "tenant-1",
      { variantId: "variant-1", quantityDelta: -3, type: StockMovementType.ADJUSTMENT, reason: "stock take shortfall" },
      "user-1",
    );

    const calls = vi.mocked(stockMutation.applyMovement).mock.calls.map((c) => c[1]);
    expect(calls).toEqual([
      expect.objectContaining({ batchId: "batch-early", quantityDelta: -2, reason: "stock take shortfall" }),
      expect.objectContaining({ batchId: "batch-late", quantityDelta: -1, reason: "stock take shortfall" }),
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STOCK_ADJUSTED" }),
      expect.anything(),
    );
  });

  it("refuses a batch-less shrinkage larger than what active batches actually hold", async () => {
    queryBuilderGetMany.mockResolvedValueOnce([fakeBatch({ quantityRemaining: 2 })]);

    await expect(
      service.adjust(
        "tenant-1",
        { variantId: "variant-1", quantityDelta: -5, type: StockMovementType.WRITE_OFF, reason: "breakage" },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "INSUFFICIENT_STOCK" });
  });

  it("opens a new batch for a batch-less positive adjustment on an untracked product", async () => {
    await service.adjust(
      "tenant-1",
      { variantId: "variant-1", quantityDelta: 12, type: StockMovementType.ADJUSTMENT, reason: "opening stock count" },
      "user-1",
    );

    const savedBatch = vi.mocked(batchRepo.save).mock.calls[0][0] as StockBatch;
    expect(savedBatch).toMatchObject({ quantityReceived: 12, quantityRemaining: 12, unitCostCents: 250, status: "ACTIVE" });
    expect(stockMutation.applyMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ batchId: "new-batch-1", quantityDelta: 12 }),
    );
  });

  it("refuses a batch-less positive adjustment on a product that tracks expiry or serials", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValueOnce(fakeProduct({ tracksExpiry: true }));

    await expect(
      service.adjust(
        "tenant-1",
        { variantId: "variant-1", quantityDelta: 12, type: StockMovementType.ADJUSTMENT, reason: "opening stock count" },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "ADJUSTMENT_BATCH_REQUIRED" });
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
