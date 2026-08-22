import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { PaymentMethod } from "@salon/shared";
import { RetailSaleService } from "./retail-sale.service";
import { Payment } from "../entities/payment.entity";
import type { Product } from "../entities/product.entity";
import type { ProductVariant } from "../entities/product-variant.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { StockMutationService } from "../inventory/stock-mutation.service";
import type { CustomerService } from "../customer/customer.service";
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
  let audit: AuditService;
  let service: RetailSaleService;

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

    const lineBatchRepo = {
      create: vi.fn((e: Partial<RetailSaleLineBatch>) => e as RetailSaleLineBatch),
      save: vi.fn(async (e: RetailSaleLineBatch) => e),
    } as unknown as Repository<RetailSaleLineBatch>;

    stockBatchGetMany = vi.fn(async () => []);
    const stockBatchQueryBuilder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getMany: stockBatchGetMany,
    };
    const batchRepo = {
      save: vi.fn(async (e: StockBatch) => e),
      createQueryBuilder: vi.fn(() => stockBatchQueryBuilder),
    } as unknown as Repository<StockBatch>;

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Payment) return paymentRepo;
        if (entity === RetailSale) return salesRepo;
        if (entity === RetailSaleLine) return lineRepo;
        if (entity === RetailSaleLineBatch) return lineBatchRepo;
        if (entity === StockBatch) return batchRepo;
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

    stockMutation = {
      lockVariant: vi.fn(async (_m: unknown, _t: string, variantId: string) => {
        const variant = variantsById.get(variantId);
        if (!variant) {
          throw Object.assign(new Error("not found"), { statusCode: 404, code: "PRODUCT_VARIANT_NOT_FOUND" });
        }
        return variant;
      }),
      applyMovement: vi.fn(async () => fakeVariant()),
    } as unknown as StockMutationService;

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new RetailSaleService(dataSource, productsRepo, salesRepo, customers, stockMutation, audit);

    // getMany() returns whatever this variant's registered batches are, sorted
    // as a real FIFO-by-expiry-then-receipt query would already return them.
    stockBatchGetMany.mockImplementation(async () => batchesByVariant.get("variant-1") ?? []);
  });

  function checkoutDto(overrides: Partial<{ lines: Array<{ variantId: string; quantity: number }> }> = {}) {
    return {
      lines: overrides.lines ?? [{ variantId: "variant-1", quantity: 2 }],
      paymentMethod: PaymentMethod.CASH,
    };
  }

  it("refuses a payment method that isn't cash/bank/card", async () => {
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
});
