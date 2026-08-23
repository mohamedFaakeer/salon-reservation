import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { ProductImportService } from "./product-import.service";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import type { StockMutationService } from "../inventory/stock-mutation.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
  } as unknown as Repository<T>;
}

const HEADER = "name,category,brand,sku,barcode,price_rs,size_volume,weight,color,opening_qty,opening_cost_rs,reorder_point,tracks_expiry,track_serial";

describe("ProductImportService", () => {
  let variants: Repository<ProductVariant>;
  let productsRepoInManager: Repository<Product>;
  let dataSource: DataSource;
  let stockMutation: StockMutationService;
  let audit: AuditService;
  let service: ProductImportService;

  beforeEach(() => {
    variants = mockRepo<ProductVariant>();
    productsRepoInManager = mockRepo<Product>();
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Product) return productsRepoInManager;
        if (entity === ProductVariant) return variants;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;
    dataSource = {
      transaction: vi.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;
    stockMutation = {
      openBatch: vi.fn(async (_m: unknown, input: { variantId: string; quantity: number }) =>
        ({ id: input.variantId, quantityOnHand: input.quantity }) as ProductVariant,
      ),
    } as unknown as StockMutationService;
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new ProductImportService(dataSource, variants, stockMutation, audit);
  });

  function csv(rows: string[]): Buffer {
    return Buffer.from([HEADER, ...rows].join("\n"), "utf-8");
  }

  it("imports a clean file, grouping multiple rows of the same product name into one product", async () => {
    const file = csv([
      "Sunsilk Black Shine Shampoo,Hair care,Sunsilk,SUN-BSN-180,,590,180ml,,,24,410,10,N,N",
      "Sunsilk Black Shine Shampoo,Hair care,Sunsilk,SUN-BSN-400,8901030812345,1190,400ml,,,,,10,N,N",
      "Face Cream - F&H,Skincare,F&H,FH-CRM-60,,780,,60g,,,,,N,N",
    ]);

    const summary = await service.importProducts("tenant-1", file, "user-1");

    expect(summary.productsCreated).toBe(2);
    expect(summary.variantsCreated).toBe(3);
    expect(summary.products).toEqual([
      { name: "Sunsilk Black Shine Shampoo", variantCount: 2 },
      { name: "Face Cream - F&H", variantCount: 1 },
    ]);
    // Opening stock only given for the first row.
    expect(stockMutation.openBatch).toHaveBeenCalledTimes(1);
    expect(stockMutation.openBatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantity: 24, unitCostCents: 41000 }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "PRODUCTS_IMPORTED" }), expect.anything());
  });

  it("reports every row's problem at once and creates nothing", async () => {
    const file = csv([
      "Sunsilk Coconut Oil,Hair care,Sunsilk,,,,,,,,,,,N,N", // missing sku and price
      "Face Cream - F&H,Skincare,F&H,FH-CRM-60,,780,60g,,,,,,N,N",
      "Face Cream - F&H,Skincare,F&H,FH-CRM-60,,900,120g,,,,,,N,N", // duplicate SKU within the file
    ]);

    await expect(service.importProducts("tenant-1", file, "user-1")).rejects.toMatchObject({
      statusCode: 400,
      code: "IMPORT_VALIDATION_FAILED",
    });
    expect(productsRepoInManager.save).not.toHaveBeenCalled();
  });

  it("refuses opening stock for a product that tracks expiry or serials, pointing at Receive stock instead", async () => {
    const file = csv(["Face Cream - F&H,Skincare,F&H,FH-CRM-60,,780,60g,,,10,520,,Y,N"]);

    await expect(service.importProducts("tenant-1", file, "user-1")).rejects.toMatchObject({
      code: "IMPORT_VALIDATION_FAILED",
    });
  });

  it("catches a SKU that already exists for this tenant", async () => {
    vi.mocked(variants.find).mockResolvedValue([{ sku: "SUN-BSN-180", barcode: null } as ProductVariant]);
    const file = csv(["Sunsilk Black Shine Shampoo,Hair care,Sunsilk,SUN-BSN-180,,590,180ml,,,,,,N,N"]);

    await expect(service.importProducts("tenant-1", file, "user-1")).rejects.toMatchObject({
      code: "IMPORT_VALIDATION_FAILED",
    });
  });

  it("rejects inconsistent tracks_expiry/track_serial flags across rows of the same product", async () => {
    const file = csv([
      "Face Cream - F&H,Skincare,F&H,FH-CRM-60,,780,60g,,,,,,N,N",
      "Face Cream - F&H,Skincare,F&H,FH-CRM-120,,1380,120g,,,,,,Y,N",
    ]);

    await expect(service.importProducts("tenant-1", file, "user-1")).rejects.toMatchObject({
      code: "IMPORT_VALIDATION_FAILED",
    });
  });

  it("rejects a file with no data rows", async () => {
    await expect(service.importProducts("tenant-1", Buffer.from(HEADER, "utf-8"), "user-1")).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });
});
