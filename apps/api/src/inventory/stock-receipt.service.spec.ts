import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { StockReceiptService } from "./stock-receipt.service";
import type { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { StockReceipt } from "../entities/stock-receipt.entity";
import type { StockMutationService } from "./stock-mutation.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeProduct(overrides: Partial<Product> = {}): Product {
  return { id: "product-1", tenantId: "tenant-1", name: "Sunsilk Shampoo", tracksExpiry: false, trackSerial: false, ...overrides } as Product;
}

describe("StockReceiptService", () => {
  let productsRepo: Repository<Product>;
  let receiptRepo: Repository<StockReceipt>;
  let variantRepo: Repository<ProductVariant>;
  let batchRepo: Repository<StockBatch>;
  let dataSource: DataSource;
  let stockMutation: StockMutationService;
  let audit: AuditService;
  let service: StockReceiptService;
  let variantState: ProductVariant;

  beforeEach(() => {
    productsRepo = mockRepo<Product>();
    receiptRepo = mockRepo<StockReceipt>();
    variantRepo = mockRepo<ProductVariant>();
    batchRepo = mockRepo<StockBatch>();
    variantState = { id: "variant-1", tenantId: "tenant-1", productId: "product-1", sku: "SHMP-400", quantityOnHand: 0, weightedAvgCostCents: 0 } as ProductVariant;

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === StockReceipt) return receiptRepo;
        if (entity === StockBatch) return batchRepo;
        if (entity === ProductVariant) return variantRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    stockMutation = {
      lockVariant: vi.fn(async () => variantState),
      applyMovement: vi.fn(async (_m: unknown, input: { quantityDelta: number }) => {
        variantState = { ...variantState, quantityOnHand: variantState.quantityOnHand + input.quantityDelta };
        return variantState;
      }),
    } as unknown as StockMutationService;

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new StockReceiptService(dataSource, productsRepo, stockMutation, audit);
  });

  it("recomputes the weighted-average cost across a receipt with two batches of the same variant", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct());

    await service.receive(
      "tenant-1",
      {
        batches: [
          { variantId: "variant-1", quantity: 10, unitCostCents: 500 },
          { variantId: "variant-1", quantity: 5, unitCostCents: 800 },
        ],
      },
      "user-1",
    );

    // (0*0 + 10*500)/10 = 500, then (10*500 + 5*800)/15 = 600
    expect(variantState.weightedAvgCostCents).toBe(600);
    expect(variantState.quantityOnHand).toBe(15);
  });

  it("sums totalCostCents across every batch on the receipt", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct());

    await service.receive(
      "tenant-1",
      {
        batches: [
          { variantId: "variant-1", quantity: 10, unitCostCents: 500 },
          { variantId: "variant-1", quantity: 5, unitCostCents: 800 },
        ],
      },
      "user-1",
    );

    const savedReceipt = vi.mocked(receiptRepo.save).mock.calls.at(-1)?.[0] as StockReceipt;
    expect(savedReceipt.totalCostCents).toBe(10 * 500 + 5 * 800);
  });

  it("rejects a batch with no expiry date when the product tracks expiry", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct({ tracksExpiry: true }));

    await expect(
      service.receive("tenant-1", { batches: [{ variantId: "variant-1", quantity: 10, unitCostCents: 500 }] }, "user-1"),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects a batch with no serial number when the product tracks serials", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct({ trackSerial: true }));

    await expect(
      service.receive("tenant-1", { batches: [{ variantId: "variant-1", quantity: 1, unitCostCents: 500 }] }, "user-1"),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects more than one unit per batch line for a serialised product", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct({ trackSerial: true }));

    await expect(
      service.receive(
        "tenant-1",
        { batches: [{ variantId: "variant-1", quantity: 2, unitCostCents: 500, serialNumber: "SN-1" }] },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects a duplicate serial number", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct({ trackSerial: true }));
    vi.mocked(batchRepo.save).mockRejectedValueOnce({ code: "23505" });

    await expect(
      service.receive(
        "tenant-1",
        { batches: [{ variantId: "variant-1", quantity: 1, unitCostCents: 500, serialNumber: "SN-1" }] },
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_SERIAL" });
  });

  it("writes a RECEIPT movement through StockMutationService for each batch", async () => {
    vi.mocked(productsRepo.findOne).mockResolvedValue(fakeProduct());

    await service.receive(
      "tenant-1",
      { batches: [{ variantId: "variant-1", quantity: 10, unitCostCents: 500 }] },
      "user-1",
    );

    expect(stockMutation.applyMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "RECEIPT", quantityDelta: 10 }),
    );
  });
});
