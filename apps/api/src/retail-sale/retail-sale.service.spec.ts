import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { PaymentMethod } from "@salon/shared";
import { RetailSaleService } from "./retail-sale.service";
import type { Branch } from "../entities/branch.entity";
import { Payment } from "../entities/payment.entity";
import type { Product } from "../entities/product.entity";
import type { ProductBundle } from "../entities/product-bundle.entity";
import type { ProductBundleComponent } from "../entities/product-bundle-component.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { RetailReturnLine } from "../entities/retail-return-line.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { Tenant } from "../entities/tenant.entity";
import { StockMutationService } from "../inventory/stock-mutation.service";
import type { CustomerService } from "../customer/customer.service";
import type { BundleService } from "../bundle/bundle.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeTenant(): Tenant {
  return { id: "tenant-1", slug: "elegance", currency: "LKR" } as Tenant;
}

function fakeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "variant-1",
    tenantId: "tenant-1",
    productId: "product-1",
    sku: "SHMP-400",
    priceCents: 1500,
    weightedAvgCostCents: 900,
    active: true,
    ...overrides,
  } as ProductVariant;
}

function fakeBatch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: "batch-1",
    tenantId: "tenant-1",
    variantId: "variant-1",
    quantityRemaining: 10,
    status: "ACTIVE",
    ...overrides,
  } as StockBatch;
}

describe("RetailSaleService", () => {
  let productsRepo: Repository<Product>;
  let salesRepo: Repository<RetailSale>;
  let dataSource: DataSource;
  let customers: CustomerService;
  let stockMutation: StockMutationService;
  let bundles: BundleService;
  let audit: AuditService;
  let service: RetailSaleService;
  let branchesRepo: Repository<Branch>;

  let paymentFindOneResult: Payment | null;
  let saleFindOneByPaymentIdResult: RetailSale | null;
  let savedSale: RetailSale | null;
  let savedLines: RetailSaleLine[];
  let resolvedCustomer: { id: string; firstName: string; lastName: string; phone: string; isWalkInPlaceholder: boolean };
  let variantsById: Map<string, ProductVariant>;
  let batchesByVariant: Map<string, StockBatch[]>;
  let stockBatchGetMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    productsRepo = mockRepo<Product>();
    vi.mocked(productsRepo.findOne).mockResolvedValue({ id: "product-1", name: "Sunsilk Shampoo" } as Product);
    branchesRepo = mockRepo<Branch>();
    vi.mocked(branchesRepo.findOne).mockResolvedValue({ address: "42 Galle Road", city: "Colombo", phone: "0112345678" } as Branch);

    paymentFindOneResult = null;
    saleFindOneByPaymentIdResult = null;
    savedSale = null;
    savedLines = [];
    resolvedCustomer = { id: "customer-1", firstName: "Ruwani", lastName: "Perera", phone: "+94771234567", isWalkInPlaceholder: false };
    variantsById = new Map([["variant-1", fakeVariant()]]);
    batchesByVariant = new Map([["variant-1", [fakeBatch()]]]);

    const paymentRepo = {
      create: vi.fn((e: Partial<Payment>) => e as Payment),
      save: vi.fn(async (e: Payment) => e),
      findOne: vi.fn(async () => paymentFindOneResult),
    } as unknown as Repository<Payment>;

    salesRepo = {
      create: vi.fn((e: Partial<RetailSale>) => e as RetailSale),
      save: vi.fn(async (e: RetailSale) => {
        savedSale = { ...e, id: e.id ?? "sale-1", customer: resolvedCustomer, soldBy: { name: "Nadia" } } as unknown as RetailSale;
        return savedSale;
      }),
      findOne: vi.fn(async (opts: { where?: { paymentId?: string } }) => {
        if (opts?.where?.paymentId !== undefined) {
          return saleFindOneByPaymentIdResult;
        }
        return savedSale;
      }),
    } as unknown as Repository<RetailSale>;

    const lineRepo = {
      create: vi.fn((e: Partial<RetailSaleLine>) => e as RetailSaleLine),
      save: vi.fn(async (e: RetailSaleLine) => {
        const withId = { ...e, id: `line-${savedLines.length + 1}` } as RetailSaleLine;
        savedLines.push(withId);
        return withId;
      }),
      find: vi.fn(async () => savedLines),
    } as unknown as Repository<RetailSaleLine>;

    // `getPublicReceipt` reads through `this.sales.manager`, same as the
    // existing `get()`/`loadView` path — a real Repository always has one.
    (salesRepo as unknown as { manager: EntityManager }).manager = {
      getRepository: (entity: unknown) => {
        if (entity === RetailSaleLine) return lineRepo;
        throw new Error("unexpected entity via sales.manager in test");
      },
    } as unknown as EntityManager;

    const lineBatchRepo = {
      create: vi.fn((e: Partial<RetailSaleLineBatch>) => e as RetailSaleLineBatch),
      save: vi.fn(async (e: RetailSaleLineBatch) => e),
    } as unknown as Repository<RetailSaleLineBatch>;

    let lastBatchQueryVariantId: string | undefined;
    stockBatchGetMany = vi.fn(async () => batchesByVariant.get(lastBatchQueryVariantId ?? "variant-1") ?? []);
    const stockBatchQueryBuilder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn((_sql: string, params?: { variantId?: string }) => {
        lastBatchQueryVariantId = params?.variantId;
        return stockBatchQueryBuilder;
      }),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getMany: stockBatchGetMany,
    };
    const batchRepo = {
      save: vi.fn(async (e: StockBatch) => e),
      createQueryBuilder: vi.fn(() => stockBatchQueryBuilder),
    } as unknown as Repository<StockBatch>;

    const returnLineQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn(async () => [] as Array<{ saleLineId: string; quantity: number }>),
    };
    const returnLineRepo = {
      createQueryBuilder: vi.fn(() => returnLineQueryBuilder),
    } as unknown as Repository<RetailReturnLine>;

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Payment) return paymentRepo;
        if (entity === RetailSale) return salesRepo;
        if (entity === RetailSaleLine) return lineRepo;
        if (entity === RetailSaleLineBatch) return lineBatchRepo;
        if (entity === StockBatch) return batchRepo;
        if (entity === RetailReturnLine) return returnLineRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    customers = {
      findOrCreateForBooking: vi.fn(async () => resolvedCustomer),
      findOrCreateWalkIn: vi.fn(async () => {
        resolvedCustomer = { id: "walkin-1", firstName: "Walk-in", lastName: "customer", phone: "WALKIN", isWalkInPlaceholder: true };
        return resolvedCustomer;
      }),
    } as unknown as CustomerService;

    // A real instance, not a full mock: `allocateFifo` is left as the real
    // implementation so it exercises the `stockBatchQueryBuilder` harness
    // above exactly as `InventoryAdjustmentService` would — only
    // `lockVariant`/`applyMovement` are stubbed.
    stockMutation = new StockMutationService();
    vi.spyOn(stockMutation, "lockVariant").mockImplementation(async (_m: unknown, _t: string, variantId: string) => {
      const variant = variantsById.get(variantId);
      if (!variant) {
        throw Object.assign(new Error("not found"), { statusCode: 404, code: "PRODUCT_VARIANT_NOT_FOUND" });
      }
      return variant;
    });
    vi.spyOn(stockMutation, "applyMovement").mockImplementation(async () => fakeVariant());

    audit = { record: vi.fn() } as unknown as AuditService;
    bundles = { getSellableBundleWithComponents: vi.fn() } as unknown as BundleService;

    service = new RetailSaleService(dataSource, productsRepo, salesRepo, branchesRepo, customers, stockMutation, bundles, audit);
  });

  function checkoutDto(overrides: Partial<{ lines: Array<{ variantId: string; quantity: number }> }> = {}) {
    return {
      lines: overrides.lines ?? [{ variantId: "variant-1", quantity: 2 }],
      paymentMethod: PaymentMethod.CASH,
    };
  }

  it("refuses a payment method that isn't cash/bank/card/QR", async () => {
    await expect(
      service.checkout(
        fakeTenant(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid for this test
        { ...checkoutDto(), paymentMethod: "GIFT_CARD" as any },
        "user-1",
        "idem-1",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("accepts QR as a sellable payment method", async () => {
    const view = await service.checkout(fakeTenant(), { ...checkoutDto(), paymentMethod: PaymentMethod.QR }, "user-1", "idem-qr");
    expect(view).toBeTruthy();
  });

  it("refuses to sell an inactive variant", async () => {
    variantsById.set("variant-1", fakeVariant({ active: false }));
    await expect(service.checkout(fakeTenant(), checkoutDto(), "user-1", "idem-2")).rejects.toMatchObject({
      code: "PRODUCT_VARIANT_INACTIVE",
    });
  });

  it("prices the sale from the variant's current priceCents, never a client-supplied price", async () => {
    variantsById.set("variant-1", fakeVariant({ priceCents: 1200 }));
    batchesByVariant.set("variant-1", [fakeBatch({ quantityRemaining: 10 })]);

    const view = await service.checkout(fakeTenant(), checkoutDto({ lines: [{ variantId: "variant-1", quantity: 3 }] }), "user-1", "idem-3");

    expect(view.totalCents).toBe(1200 * 3);
    expect(view.subtotalCents).toBe(1200 * 3);
  });

  it("resolves the tenant's walk-in placeholder when no customer is attached", async () => {
    const view = await service.checkout(fakeTenant(), checkoutDto(), "user-1", "idem-4");

    expect(customers.findOrCreateWalkIn).toHaveBeenCalledWith("tenant-1", expect.anything());
    expect(customers.findOrCreateForBooking).not.toHaveBeenCalled();
    expect(view.customer.isWalkIn).toBe(true);
  });

  it("resolves a real customer via findOrCreateForBooking when one is given", async () => {
    const dto = { ...checkoutDto(), customer: { firstName: "Ruwani", lastName: "Perera", phone: "+94771234567" } };
    const view = await service.checkout(fakeTenant(), dto, "user-1", "idem-5");

    expect(customers.findOrCreateForBooking).toHaveBeenCalledWith("tenant-1", dto.customer, expect.anything());
    expect(customers.findOrCreateWalkIn).not.toHaveBeenCalled();
    expect(view.customer.isWalkIn).toBe(false);
  });

  it("allocates FIFO by expiry, spilling into the next batch when the first isn't enough", async () => {
    batchesByVariant.set("variant-1", [
      fakeBatch({ id: "batch-early", expiresAt: "2026-01-01", quantityRemaining: 3 }),
      fakeBatch({ id: "batch-late", expiresAt: "2026-06-01", quantityRemaining: 10 }),
    ]);

    await service.checkout(fakeTenant(), checkoutDto({ lines: [{ variantId: "variant-1", quantity: 5 }] }), "user-1", "idem-6");

    const calls = vi.mocked(stockMutation.applyMovement).mock.calls.map((c) => c[1]);
    expect(calls).toEqual([
      expect.objectContaining({ batchId: "batch-early", quantityDelta: -3 }),
      expect.objectContaining({ batchId: "batch-late", quantityDelta: -2 }),
    ]);
  });

  it("rejects checkout when no combination of active batches covers the requested quantity", async () => {
    batchesByVariant.set("variant-1", [fakeBatch({ quantityRemaining: 2 })]);

    await expect(
      service.checkout(fakeTenant(), checkoutDto({ lines: [{ variantId: "variant-1", quantity: 5 }] }), "user-1", "idem-7"),
    ).rejects.toMatchObject({ statusCode: 409, code: "INSUFFICIENT_STOCK" });
  });

  it("writes one RetailSaleLine per cart line and one RetailSaleLineBatch per batch drawn from", async () => {
    batchesByVariant.set("variant-1", [
      fakeBatch({ id: "batch-a", quantityRemaining: 1 }),
      fakeBatch({ id: "batch-b", quantityRemaining: 5 }),
    ]);

    const view = await service.checkout(fakeTenant(), checkoutDto({ lines: [{ variantId: "variant-1", quantity: 3 }] }), "user-1", "idem-8");

    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].quantity).toBe(3);
    expect(view.lines[0].unitCostCentsSnapshot).toBe(900);
  });

  it("is idempotent — a retried key returns the already-completed sale, not a second one", async () => {
    paymentFindOneResult = { id: "payment-existing" } as Payment;
    saleFindOneByPaymentIdResult = { id: "sale-existing" } as RetailSale;
    savedSale = {
      id: "sale-existing",
      subtotalCents: 3000,
      totalCents: 3000,
      status: "COMPLETED",
      paymentId: "payment-existing",
      customer: resolvedCustomer,
      soldBy: { name: "Nadia" },
      createdAt: new Date(),
    } as unknown as RetailSale;

    const view = await service.checkout(fakeTenant(), checkoutDto(), "user-1", "idem-repeat");

    expect(view.id).toBe("sale-existing");
    expect(stockMutation.lockVariant).not.toHaveBeenCalled();
    expect(customers.findOrCreateWalkIn).not.toHaveBeenCalled();
  });

  describe("bundle lines", () => {
    function fakeBundleData(): { bundle: ProductBundle; components: ProductBundleComponent[] } {
      return {
        bundle: { id: "bundle-1", tenantId: "tenant-1", name: "Gift Set", priceCents: 2000, active: true } as ProductBundle,
        components: [
          { id: "c1", bundleId: "bundle-1", variantId: "variant-1", quantityPerBundle: 1 },
          { id: "c2", bundleId: "bundle-1", variantId: "variant-2", quantityPerBundle: 2 },
        ] as ProductBundleComponent[],
      };
    }

    beforeEach(() => {
      variantsById.set("variant-2", fakeVariant({ id: "variant-2", sku: "COND-400", priceCents: 800, weightedAvgCostCents: 400 }));
      batchesByVariant.set("variant-2", [fakeBatch({ id: "batch-cond", variantId: "variant-2", quantityRemaining: 20 })]);
      vi.mocked(bundles.getSellableBundleWithComponents).mockResolvedValue(fakeBundleData());
    });

    it("rejects a cart line with both variantId and bundleId", async () => {
      await expect(
        service.checkout(fakeTenant(), { lines: [{ variantId: "variant-1", bundleId: "bundle-1", quantity: 1 }], paymentMethod: PaymentMethod.CASH }, "user-1", "idem-b1"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a cart line with neither variantId nor bundleId", async () => {
      await expect(
        service.checkout(fakeTenant(), { lines: [{ quantity: 1 }], paymentMethod: PaymentMethod.CASH }, "user-1", "idem-b2"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("sells a bundle as one aggregate line, priced at the bundle's price and costed across its components", async () => {
      const view = await service.checkout(
        fakeTenant(),
        { lines: [{ bundleId: "bundle-1", quantity: 2 }], paymentMethod: PaymentMethod.CASH },
        "user-1",
        "idem-b3",
      );

      expect(view.lines).toHaveLength(1);
      expect(view.lines[0].bundleId).toBe("bundle-1");
      expect(view.lines[0].variantId).toBeNull();
      expect(view.lines[0].skuSnapshot).toBeNull();
      // Cost per bundle: variant-1 (900 * 1) + variant-2 (400 * 2) = 1700.
      expect(view.lines[0].unitCostCentsSnapshot).toBe(1700);
      // 2 bundles at Rs 2000 each.
      expect(view.totalCents).toBe(4000);
    });

    it("draws stock from every component variant, in quantityPerBundle * bundle quantity", async () => {
      await service.checkout(fakeTenant(), { lines: [{ bundleId: "bundle-1", quantity: 3 }], paymentMethod: PaymentMethod.CASH }, "user-1", "idem-b4");

      const movementCalls = vi.mocked(stockMutation.applyMovement).mock.calls.map((c) => c[1]);
      expect(movementCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ variantId: "variant-1", quantityDelta: -3 }), // 1 per bundle * 3
          expect.objectContaining({ variantId: "variant-2", quantityDelta: -6 }), // 2 per bundle * 3
        ]),
      );
    });

    it("locks every touched variant — direct lines and every bundle component — in one sorted order", async () => {
      await service.checkout(
        fakeTenant(),
        { lines: [{ bundleId: "bundle-1", quantity: 1 }], paymentMethod: PaymentMethod.CASH },
        "user-1",
        "idem-b5",
      );

      const lockedIds = vi.mocked(stockMutation.lockVariant).mock.calls.map((c) => c[2]);
      expect(lockedIds).toEqual([...lockedIds].sort());
      expect(lockedIds).toEqual(expect.arrayContaining(["variant-1", "variant-2"]));
    });

    it("refuses to sell an inactive bundle", async () => {
      vi.mocked(bundles.getSellableBundleWithComponents).mockRejectedValueOnce(
        Object.assign(new Error("not found"), { statusCode: 404, code: "PRODUCT_BUNDLE_NOT_FOUND" }),
      );
      await expect(
        service.checkout(fakeTenant(), { lines: [{ bundleId: "bundle-1", quantity: 1 }], paymentMethod: PaymentMethod.CASH }, "user-1", "idem-b6"),
      ).rejects.toMatchObject({ code: "PRODUCT_BUNDLE_NOT_FOUND" });
    });
  });

  describe("getPublicReceipt", () => {
    it("returns a receipt-shaped view keyed only by the sale id, no auth", async () => {
      savedSale = {
        id: "sale-1",
        tenantId: "tenant-1",
        subtotalCents: 1770,
        totalCents: 1770,
        createdAt: new Date("2026-08-23T10:42:00Z"),
        tenant: { name: "Elegance Salon" },
        customer: { firstName: "Faakeer", lastName: "Mohamed", phone: "0771932264", isWalkInPlaceholder: false },
        soldBy: { name: "Priya Fernando" },
        payment: { method: PaymentMethod.CASH },
      } as unknown as RetailSale;
      savedLines = [
        {
          id: "line-1",
          bundleId: null,
          nameSnapshot: "Sunsilk Black Shine Shampoo — 180ml",
          skuSnapshot: "SUN-BSN-180",
          quantity: 1,
          lineTotalCents: 590,
        } as RetailSaleLine,
      ];

      const receipt = await service.getPublicReceipt("sale-1");

      expect(receipt).toMatchObject({
        id: "sale-1",
        salon: { name: "Elegance Salon", address: "42 Galle Road", city: "Colombo", phone: "0112345678" },
        customer: { name: "Faakeer Mohamed", phone: "0771932264", isWalkIn: false },
        soldByName: "Priya Fernando",
        paymentMethod: PaymentMethod.CASH,
        totalCents: 1770,
      });
      expect(receipt.lines).toEqual([expect.objectContaining({ nameSnapshot: "Sunsilk Black Shine Shampoo — 180ml", quantity: 1 })]);
    });

    it("404s rather than leaking whether a sale id exists", async () => {
      savedSale = null;

      await expect(service.getPublicReceipt("no-such-sale")).rejects.toMatchObject({
        statusCode: 404,
        code: "RETAIL_SALE_NOT_FOUND",
      });
    });
  });
});
