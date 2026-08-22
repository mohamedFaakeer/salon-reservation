import type { ObjectLiteral, Repository } from "typeorm";
import { ProductService } from "./product.service";
import type { Product } from "../entities/product.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import type { StockBatch } from "../entities/stock-batch.entity";
import type { CloudinaryService } from "../cloudinary/cloudinary.service";
import type { AuditService } from "../audit/audit.service";

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
  let cloudinary: CloudinaryService;
  let audit: AuditService;
  let service: ProductService;

  beforeEach(() => {
    products = mockRepo<Product>();
    variants = mockRepo<ProductVariant>();
    batches = mockRepo<StockBatch>();
    cloudinary = { uploadProductImage: vi.fn(async () => "https://res.cloudinary.com/demo/product.png") } as unknown as CloudinaryService;
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new ProductService(products, variants, batches, cloudinary, audit);
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
