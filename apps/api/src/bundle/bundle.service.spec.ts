import type { ObjectLiteral, Repository } from "typeorm";
import { BundleService } from "./bundle.service";
import type { ProductBundle } from "../entities/product-bundle.entity";
import type { ProductBundleComponent } from "../entities/product-bundle-component.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T | T[]) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[], 0] as [T[], number]),
    delete: vi.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<T>;
}

function fakeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "variant-1",
    tenantId: "tenant-1",
    sku: "SHMP-400",
    quantityOnHand: 10,
    product: { name: "Sunsilk Shampoo" },
    ...overrides,
  } as ProductVariant;
}

function fakeBundle(overrides: Partial<ProductBundle> = {}): ProductBundle {
  return { id: "bundle-1", tenantId: "tenant-1", name: "Gift Set", priceCents: 2000, active: true, ...overrides } as ProductBundle;
}

function fakeComponent(overrides: Partial<ProductBundleComponent> = {}): ProductBundleComponent {
  return { id: "component-1", bundleId: "bundle-1", variantId: "variant-1", quantityPerBundle: 1, ...overrides } as ProductBundleComponent;
}

describe("BundleService", () => {
  let bundles: Repository<ProductBundle>;
  let components: Repository<ProductBundleComponent>;
  let variants: Repository<ProductVariant>;
  let audit: AuditService;
  let service: BundleService;

  beforeEach(() => {
    bundles = mockRepo<ProductBundle>();
    components = mockRepo<ProductBundleComponent>();
    variants = mockRepo<ProductVariant>();
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new BundleService(bundles, components, variants, audit);
  });

  describe("create", () => {
    it("rejects the same component variant listed twice", async () => {
      await expect(
        service.create(
          "tenant-1",
          { name: "Gift Set", priceCents: 2000, components: [{ variantId: "variant-1", quantityPerBundle: 1 }, { variantId: "variant-1", quantityPerBundle: 2 }] },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "DUPLICATE_COMPONENT_VARIANT" });
    });

    it("rejects a component variant that doesn't belong to this tenant", async () => {
      vi.mocked(variants.find).mockResolvedValueOnce([]);
      await expect(
        service.create("tenant-1", { name: "Gift Set", priceCents: 2000, components: [{ variantId: "variant-1", quantityPerBundle: 1 }] }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_VARIANT_IDS" });
    });

    it("creates the bundle and its components", async () => {
      vi.mocked(variants.find).mockResolvedValueOnce([fakeVariant()]);
      const view = await service.create(
        "tenant-1",
        { name: "Gift Set", priceCents: 2000, components: [{ variantId: "variant-1", quantityPerBundle: 2 }] },
        "user-1",
      );
      expect(view.name).toBe("Gift Set");
      expect(view.components).toHaveLength(1);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "PRODUCT_BUNDLE_CREATED" }));
    });
  });

  describe("availability computation", () => {
    it("is the minimum of floor(quantityOnHand / quantityPerBundle) across components", async () => {
      vi.mocked(bundles.findOne).mockResolvedValue(fakeBundle());
      vi.mocked(components.find).mockResolvedValue([
        fakeComponent({ id: "c1", variantId: "variant-1", quantityPerBundle: 2 }),
        fakeComponent({ id: "c2", variantId: "variant-2", quantityPerBundle: 1 }),
      ]);
      vi.mocked(variants.find).mockResolvedValue([
        fakeVariant({ id: "variant-1", quantityOnHand: 10 }), // floor(10/2) = 5
        fakeVariant({ id: "variant-2", quantityOnHand: 3 }), // floor(3/1) = 3
      ]);

      const view = await service.get("tenant-1", "bundle-1");
      expect(view.availableCount).toBe(3);
    });

    it("is 0 for a bundle with no components, not Infinity", async () => {
      vi.mocked(bundles.findOne).mockResolvedValue(fakeBundle());
      vi.mocked(components.find).mockResolvedValue([]);

      const view = await service.get("tenant-1", "bundle-1");
      expect(view.availableCount).toBe(0);
    });
  });

  describe("getSellableBundleWithComponents", () => {
    it("404s when the bundle is inactive", async () => {
      vi.mocked(bundles.findOne).mockResolvedValue(fakeBundle({ active: false }));
      await expect(service.getSellableBundleWithComponents("tenant-1", "bundle-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "PRODUCT_BUNDLE_NOT_FOUND",
      });
    });

    it("refuses a bundle with no components configured", async () => {
      vi.mocked(bundles.findOne).mockResolvedValue(fakeBundle());
      vi.mocked(components.find).mockResolvedValue([]);
      await expect(service.getSellableBundleWithComponents("tenant-1", "bundle-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "BUNDLE_HAS_NO_COMPONENTS",
      });
    });

    it("returns the bundle and its components when sellable", async () => {
      vi.mocked(bundles.findOne).mockResolvedValue(fakeBundle());
      vi.mocked(components.find).mockResolvedValue([fakeComponent()]);
      const result = await service.getSellableBundleWithComponents("tenant-1", "bundle-1");
      expect(result.components).toHaveLength(1);
    });
  });

  describe("removeComponent", () => {
    it("404s when the component doesn't belong to this bundle", async () => {
      vi.mocked(bundles.findOne).mockResolvedValue(fakeBundle());
      vi.mocked(components.findOne).mockResolvedValue(null);
      await expect(service.removeComponent("tenant-1", "bundle-1", "missing", "user-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
