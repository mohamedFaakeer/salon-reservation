import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { ProductService } from "./product.service";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { StockMovement } from "../entities/stock-movement.entity";
import type { CloudinaryService } from "../cloudinary/cloudinary.service";
import type { AuditService } from "../audit/audit.service";
import type { StockMutationService } from "../inventory/stock-mutation.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[], 0] as [T[], number]),
  } as unknown as Repository<T>;
}

/** Minimal well-formed PNG header — width/height live at fixed offsets in the IHDR chunk. */
function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("ProductService", () => {
  let products: Repository<Product>;
  let variants: Repository<ProductVariant>;
  let batches: Repository<StockBatch>;
  let movements: Repository<StockMovement>;
  let movementsGetRawMany: ReturnType<typeof vi.fn>;
  let cloudinary: CloudinaryService;
  let audit: AuditService;
  let stockMutation: StockMutationService;
  let dataSource: DataSource;
  let service: ProductService;

  beforeEach(() => {
    products = mockRepo<Product>();
    variants = mockRepo<ProductVariant>();
    batches = mockRepo<StockBatch>();
    movementsGetRawMany = vi.fn(async () => [] as Array<{ variantId: string; unitsSold: number }>);
    const movementsQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      getRawMany: movementsGetRawMany,
    };
    movements = {
      createQueryBuilder: vi.fn(() => movementsQueryBuilder),
    } as unknown as Repository<StockMovement>;
    cloudinary = { uploadProductImage: vi.fn(async () => "https://res.cloudinary.com/demo/product.png") } as unknown as CloudinaryService;
    audit = { record: vi.fn() } as unknown as AuditService;
    stockMutation = {
      openBatch: vi.fn(async (_m: unknown, input: { variantId: string; quantity: number }) =>
        ({ id: input.variantId, quantityOnHand: input.quantity }) as ProductVariant,
      ),
    } as unknown as StockMutationService;
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Product) return products;
        if (entity === ProductVariant) return variants;
        if (entity === StockBatch) return batches;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;
    dataSource = {
      transaction: vi.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;
    service = new ProductService(dataSource, products, variants, batches, movements, cloudinary, audit, stockMutation);
  });

  describe("create", () => {
    it("persists with the caller's tenantId and active: true", async () => {
      await service.create("tenant-1", { name: "Sunsilk Shampoo" }, "user-1");
      const created = vi.mocked(products.create).mock.calls[0][0] as Product;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.active).toBe(true);
    });
  });

  describe("createVariant", () => {
    it("rejects a duplicate SKU or barcode as a 409, not a raw DB error", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1" } as Product);
      vi.mocked(variants.save).mockRejectedValueOnce({ code: "23505" });

      await expect(
        service.createVariant("tenant-1", "product-1", { sku: "SUN-400", priceCents: 1000 }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_SKU_OR_BARCODE" });
    });

    it("opens a batch through StockMutationService when opening stock is given", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", tracksExpiry: false, trackSerial: false } as Product);

      await service.createVariant(
        "tenant-1",
        "product-1",
        { sku: "SUN-400", priceCents: 1000, openingQuantity: 24, openingUnitCostCents: 410 },
        "user-1",
      );

      expect(stockMutation.openBatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tenantId: "tenant-1", quantity: 24, unitCostCents: 410 }),
      );
    });

    it("never opens a batch when no opening stock is given", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", tracksExpiry: false, trackSerial: false } as Product);
      await service.createVariant("tenant-1", "product-1", { sku: "SUN-400", priceCents: 1000 }, "user-1");
      expect(stockMutation.openBatch).not.toHaveBeenCalled();
    });

    it("rejects opening quantity given without a cost, or vice versa", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", tracksExpiry: false, trackSerial: false } as Product);
      await expect(
        service.createVariant("tenant-1", "product-1", { sku: "SUN-400", priceCents: 1000, openingQuantity: 5 }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("requires an expiry date for opening stock on a product that tracks expiry", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", name: "Face Cream", tracksExpiry: true, trackSerial: false } as Product);
      await expect(
        service.createVariant(
          "tenant-1",
          "product-1",
          { sku: "FH-CRM-60", priceCents: 780, openingQuantity: 10, openingUnitCostCents: 520 },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("accepts opening stock with an expiry date for a product that tracks expiry", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", name: "Face Cream", tracksExpiry: true, trackSerial: false } as Product);
      await service.createVariant(
        "tenant-1",
        "product-1",
        { sku: "FH-CRM-60", priceCents: 780, openingQuantity: 10, openingUnitCostCents: 520, openingExpiresAt: "2027-03-15" },
        "user-1",
      );
      expect(stockMutation.openBatch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ expiresAt: "2027-03-15" }),
      );
    });

    it("requires exactly one unit of opening stock for a product that tracks serials", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", name: "Hair Dryer", tracksExpiry: false, trackSerial: true } as Product);
      await expect(
        service.createVariant(
          "tenant-1",
          "product-1",
          { sku: "DRY-3000", priceCents: 12000, openingQuantity: 2, openingUnitCostCents: 8000, openingSerialNumber: "SN-1" },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });
  });

  describe("listActiveBatches", () => {
    it("404s when the variant does not belong to this tenant", async () => {
      vi.mocked(variants.findOne).mockResolvedValue(null);
      await expect(service.listActiveBatches("tenant-1", "missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "PRODUCT_VARIANT_NOT_FOUND",
      });
    });

    it("lists only ACTIVE batches, oldest-expiring first", async () => {
      vi.mocked(variants.findOne).mockResolvedValue({ id: "variant-1", tenantId: "tenant-1" } as ProductVariant);
      await service.listActiveBatches("tenant-1", "variant-1");
      expect(batches.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1", variantId: "variant-1", status: "ACTIVE" },
          order: { expiresAt: "ASC", createdAt: "ASC" },
        }),
      );
    });
  });

  describe("uploadImage", () => {
    it("refuses a file over the size ceiling before ever reading it as an image", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1" } as Product);
      const oversized = Buffer.alloc(2_000_001);
      await expect(service.uploadImage("tenant-1", "product-1", oversized)).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_IMAGE_FILE_TOO_LARGE",
      });
      expect(cloudinary.uploadProductImage).not.toHaveBeenCalled();
    });

    it("refuses a buffer that isn't a recognised PNG/JPEG/WebP", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1" } as Product);
      await expect(service.uploadImage("tenant-1", "product-1", Buffer.from("not an image"))).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_IMAGE_INVALID_FILE_TYPE",
      });
    });

    it("refuses dimensions outside the allowed range", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1" } as Product);
      await expect(service.uploadImage("tenant-1", "product-1", pngBuffer(50, 50))).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_IMAGE_DIMENSIONS_OUT_OF_RANGE",
      });
    });

    it("refuses an aspect ratio more elongated than 3:1", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1" } as Product);
      await expect(service.uploadImage("tenant-1", "product-1", pngBuffer(1800, 300))).rejects.toMatchObject({
        statusCode: 400,
        code: "PRODUCT_IMAGE_ASPECT_RATIO_INVALID",
      });
    });

    it("uploads a valid image and saves the returned URL onto the product", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1" } as Product);
      const product = await service.uploadImage("tenant-1", "product-1", pngBuffer(800, 800));
      expect(cloudinary.uploadProductImage).toHaveBeenCalledWith(expect.any(Buffer), "product-images/tenant-1/products");
      expect(product.imageUrl).toBe("https://res.cloudinary.com/demo/product.png");
    });
  });

  describe("lookupVariants — reorder signal", () => {
    let queryBuilder: { andWhere: ReturnType<typeof vi.fn> };

    function stubVariantQuery(rows: ProductVariant[]): void {
      const qb = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn(async () => [rows, rows.length] as [ProductVariant[], number]),
      };
      queryBuilder = qb;
      service = new ProductService(
        dataSource,
        products,
        { ...variants, createQueryBuilder: vi.fn(() => qb) } as unknown as Repository<ProductVariant>,
        batches,
        movements,
        cloudinary,
        audit,
        stockMutation,
      );
    }

    it("filters out variants whose parent product is deactivated (UAT PRD-16)", async () => {
      stubVariantQuery([]);
      await service.lookupVariants("tenant-1", { limit: 50, offset: 0 });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith("product.active = true");
    });

    it("flags a variant under its reorder point even with no sales history", async () => {
      stubVariantQuery([{ id: "v1", quantityOnHand: 2, reorderPoint: 5 } as ProductVariant]);
      const result = await service.lookupVariants("tenant-1", { limit: 50, offset: 0 });
      expect(result.data[0].reorderSoon).toBe(true);
      expect(result.data[0].salesVelocityPerDay).toBeNull();
      expect(result.data[0].daysOfStockLeft).toBeNull();
    });

    it("flags a variant projected to run out within 7 days from recent velocity, even above its reorder point", async () => {
      stubVariantQuery([{ id: "v1", quantityOnHand: 10, reorderPoint: 2 } as ProductVariant]);
      // 60 units sold over the 30-day window = 2/day -> 10 on hand / 2 per day = 5 days left.
      movementsGetRawMany.mockResolvedValueOnce([{ variantId: "v1", unitsSold: 60 }]);

      const result = await service.lookupVariants("tenant-1", { limit: 50, offset: 0 });
      expect(result.data[0].salesVelocityPerDay).toBe(2);
      expect(result.data[0].daysOfStockLeft).toBe(5);
      expect(result.data[0].reorderSoon).toBe(true);
    });

    it("does not flag a variant with healthy stock and slow velocity", async () => {
      stubVariantQuery([{ id: "v1", quantityOnHand: 100, reorderPoint: 5 } as ProductVariant]);
      // 3 units over 30 days -> 0.1/day -> 1000 days left.
      movementsGetRawMany.mockResolvedValueOnce([{ variantId: "v1", unitsSold: 3 }]);

      const result = await service.lookupVariants("tenant-1", { limit: 50, offset: 0 });
      expect(result.data[0].reorderSoon).toBe(false);
    });

    it("never divides by zero when a variant has no sales in the window", async () => {
      stubVariantQuery([{ id: "v1", quantityOnHand: 50, reorderPoint: null } as ProductVariant]);
      const result = await service.lookupVariants("tenant-1", { limit: 50, offset: 0 });
      expect(result.data[0].daysOfStockLeft).toBeNull();
      expect(result.data[0].reorderSoon).toBe(false);
    });
  });

  describe("removeImage / removeVariantImage", () => {
    it("clears the product's imageUrl without touching Cloudinary", async () => {
      vi.mocked(products.findOne).mockResolvedValue({ id: "product-1", tenantId: "tenant-1", imageUrl: "https://x" } as Product);
      const product = await service.removeImage("tenant-1", "product-1");
      expect(product.imageUrl).toBeNull();
      expect(cloudinary.uploadProductImage).not.toHaveBeenCalled();
    });

    it("clears the variant's imageUrl", async () => {
      vi.mocked(variants.findOne).mockResolvedValue({ id: "variant-1", tenantId: "tenant-1", productId: "product-1", imageUrl: "https://x" } as ProductVariant);
      const variant = await service.removeVariantImage("tenant-1", "product-1", "variant-1");
      expect(variant.imageUrl).toBeNull();
    });
  });
});
