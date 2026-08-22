import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { RetailReturnDisposition, RetailSaleStatus } from "@salon/shared";
import { RetailReturnService } from "./retail-return.service";
import { Product } from "../entities/product.entity";
import { RetailReturn } from "../entities/retail-return.entity";
import { RetailReturnLine } from "../entities/retail-return-line.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { StockMutationService } from "../inventory/stock-mutation.service";
import type { RetailSaleService } from "./retail-sale.service";
import type { PaymentService } from "../payment/payment.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ ...e, id: (e as { id?: string }).id ?? "generated-id" }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeTenant(): Tenant {
  return { id: "tenant-1", slug: "elegance" } as Tenant;
}

function fakeSale(overrides: Partial<RetailSale> = {}): RetailSale {
  return { id: "sale-1", tenantId: "tenant-1", paymentId: "payment-1", status: RetailSaleStatus.COMPLETED, ...overrides } as RetailSale;
}

function fakeSaleLine(overrides: Partial<RetailSaleLine> = {}): RetailSaleLine {
  return {
    id: "line-1",
    saleId: "sale-1",
    variantId: "variant-1",
    nameSnapshot: "Sunsilk Shampoo",
    quantity: 3,
    unitCostCentsSnapshot: 410,
    ...overrides,
  } as RetailSaleLine;
}

describe("RetailReturnService", () => {
  let salesRepo: Repository<RetailSale>;
  let returnRepo: Repository<RetailReturn>;
  let returnLineRepo: Repository<RetailReturnLine>;
  let saleLineRepo: Repository<RetailSaleLine>;
  let productRepo: Repository<Product>;
  let batchRepo: Repository<StockBatch>;
  let lineBatchRepo: Repository<RetailSaleLineBatch>;
  let dataSource: DataSource;
  let stockMutation: StockMutationService;
  let retailSales: RetailSaleService;
  let payments: PaymentService;
  let audit: AuditService;
  let service: RetailReturnService;

  let savedReturnLines: RetailReturnLine[];

  beforeEach(() => {
    salesRepo = mockRepo<RetailSale>();
    returnRepo = mockRepo<RetailReturn>();
    returnLineRepo = mockRepo<RetailReturnLine>();
    saleLineRepo = mockRepo<RetailSaleLine>();
    productRepo = mockRepo<Product>();
    batchRepo = mockRepo<StockBatch>();
    lineBatchRepo = mockRepo<RetailSaleLineBatch>();

    // `returnedQuantityFor`/`recomputeSaleStatus` re-read what was just
    // written via `find()` within the same `process()` call, so this mock
    // has to actually accumulate rows rather than always answering "none yet".
    savedReturnLines = [];
    vi.mocked(returnLineRepo.save).mockImplementation(async (e: unknown) => {
      const line = { ...(e as RetailReturnLine), id: `return-line-${savedReturnLines.length + 1}` };
      savedReturnLines.push(line);
      return line;
    });
    vi.mocked(returnLineRepo.find).mockImplementation(async (opts: unknown) => {
      const where = (opts as { where?: { saleLineId?: string } })?.where;
      return where?.saleLineId ? savedReturnLines.filter((l) => l.saleLineId === where.saleLineId) : savedReturnLines;
    });

    vi.mocked(salesRepo.findOne).mockResolvedValue(fakeSale());
    vi.mocked(saleLineRepo.findOne).mockResolvedValue(fakeSaleLine());
    vi.mocked(productRepo.findOne).mockResolvedValue({ id: "product-1", name: "Sunsilk Shampoo", tracksExpiry: false, trackSerial: false } as Product);

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === RetailSale) return salesRepo;
        if (entity === RetailReturn) return returnRepo;
        if (entity === RetailReturnLine) return returnLineRepo;
        if (entity === RetailSaleLine) return saleLineRepo;
        if (entity === Product) return productRepo;
        if (entity === StockBatch) return batchRepo;
        if (entity === RetailSaleLineBatch) return lineBatchRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
      manager,
    } as unknown as DataSource;

    stockMutation = {
      lockVariant: vi.fn(async () => ({ id: "variant-1", tenantId: "tenant-1", productId: "product-1", sku: "SHMP-400" })),
      applyMovement: vi.fn(async () => ({})),
    } as unknown as StockMutationService;

    retailSales = { loadView: vi.fn(async () => ({ id: "sale-1" })) } as unknown as RetailSaleService;
    payments = { refundWithManager: vi.fn(async () => ({ id: "refund-1" })) } as unknown as PaymentService;
    audit = { record: vi.fn() } as unknown as AuditService;

    service = new RetailReturnService(dataSource, stockMutation, retailSales, payments, audit);
  });

  it("404s when the sale doesn't belong to this tenant", async () => {
    vi.mocked(salesRepo.findOne).mockResolvedValueOnce(null);
    await expect(
      service.process(fakeTenant(), "sale-1", { reason: "damaged", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1"),
    ).rejects.toMatchObject({ statusCode: 404, code: "RETAIL_SALE_NOT_FOUND" });
  });

  it("refuses returning a bundle line (variantId null)", async () => {
    vi.mocked(saleLineRepo.findOne).mockResolvedValueOnce(fakeSaleLine({ variantId: null, bundleId: "bundle-1" }));
    await expect(
      service.process(fakeTenant(), "sale-1", { reason: "damaged", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1"),
    ).rejects.toMatchObject({ statusCode: 409, code: "BUNDLE_RETURN_NOT_SUPPORTED" });
  });

  it("refuses returning more than what remains on the line", async () => {
    await expect(
      service.process(fakeTenant(), "sale-1", { reason: "damaged", lines: [{ saleLineId: "line-1", quantity: 5, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1"),
    ).rejects.toMatchObject({ statusCode: 409, code: "RETURN_EXCEEDS_SALE_QUANTITY" });
  });

  describe("QUARANTINE", () => {
    it("never touches stock — no batch, no movement", async () => {
      await service.process(fakeTenant(), "sale-1", { reason: "damaged", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1");
      expect(stockMutation.applyMovement).not.toHaveBeenCalled();
      expect(batchRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("RESTOCK — lot-tracked/untracked product", () => {
    it("creates a fresh batch at the original sale line's cost snapshot", async () => {
      await service.process(
        fakeTenant(),
        "sale-1",
        { reason: "customer changed their mind", lines: [{ saleLineId: "line-1", quantity: 2, disposition: RetailReturnDisposition.RESTOCK }] },
        "user-1",
      );
      const savedBatch = vi.mocked(batchRepo.save).mock.calls[0][0] as StockBatch;
      expect(savedBatch.unitCostCents).toBe(410);
      expect(savedBatch.quantityReceived).toBe(2);
      expect(savedBatch.quantityRemaining).toBe(2);
      expect(stockMutation.applyMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "RETURN_RESTOCK", quantityDelta: 2 }),
      );
    });

    it("requires an expiry date when the product tracks expiry", async () => {
      vi.mocked(productRepo.findOne).mockResolvedValueOnce({ id: "product-1", name: "Sunsilk Shampoo", tracksExpiry: true, trackSerial: false } as Product);
      await expect(
        service.process(fakeTenant(), "sale-1", { reason: "damaged box", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.RESTOCK }] }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });
  });

  describe("RESTOCK — serialised product", () => {
    beforeEach(() => {
      vi.mocked(productRepo.findOne).mockResolvedValue({ id: "product-1", name: "Philips Hair Dryer", tracksExpiry: false, trackSerial: true } as Product);
      vi.mocked(saleLineRepo.findOne).mockResolvedValue(fakeSaleLine({ quantity: 1, unitCostCentsSnapshot: 6200 }));
    });

    it("requires the serial number", async () => {
      await expect(
        service.process(fakeTenant(), "sale-1", { reason: "unused, returned", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.RESTOCK }] }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("404s when no batch is on file with that serial", async () => {
      vi.mocked(batchRepo.findOne).mockResolvedValueOnce(null);
      await expect(
        service.process(
          fakeTenant(),
          "sale-1",
          { reason: "unused, returned", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.RESTOCK, serialNumber: "SN-404" }] },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "STOCK_BATCH_NOT_FOUND" });
    });

    it("refuses a serial that wasn't drawn from this sale line", async () => {
      vi.mocked(batchRepo.findOne).mockResolvedValueOnce({ id: "batch-9", quantityRemaining: 0 } as StockBatch);
      vi.mocked(lineBatchRepo.findOne).mockResolvedValueOnce(null);
      await expect(
        service.process(
          fakeTenant(),
          "sale-1",
          { reason: "unused, returned", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.RESTOCK, serialNumber: "SN-1" }] },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: "SERIAL_NOT_FROM_THIS_SALE" });
    });

    it("reactivates the exact original batch by serial", async () => {
      vi.mocked(batchRepo.findOne).mockResolvedValueOnce({ id: "batch-9", quantityRemaining: 0, status: "DEPLETED" } as StockBatch);
      vi.mocked(lineBatchRepo.findOne).mockResolvedValueOnce({ id: "join-1", saleLineId: "line-1", batchId: "batch-9" } as RetailSaleLineBatch);

      await service.process(
        fakeTenant(),
        "sale-1",
        { reason: "unused, returned", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.RESTOCK, serialNumber: "SN-1" }] },
        "user-1",
      );

      const savedBatch = vi.mocked(batchRepo.save).mock.calls[0][0] as StockBatch;
      expect(savedBatch.id).toBe("batch-9");
      expect(savedBatch.quantityRemaining).toBe(1);
      expect(savedBatch.status).toBe("ACTIVE");
    });
  });

  describe("refund", () => {
    it("skips PaymentService entirely when refundCents is omitted", async () => {
      await service.process(fakeTenant(), "sale-1", { reason: "exchange only", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1");
      expect(payments.refundWithManager).not.toHaveBeenCalled();
    });

    it("refunds exactly the staff-entered amount", async () => {
      await service.process(
        fakeTenant(),
        "sale-1",
        { reason: "faulty item", refundCents: 500, lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] },
        "user-1",
      );
      expect(payments.refundWithManager).toHaveBeenCalledWith(expect.anything(), expect.anything(), "payment-1", { amountCents: 500, reason: "faulty item" }, "user-1");
      const savedReturn = vi.mocked(returnRepo.save).mock.calls.at(-1)?.[0] as RetailReturn;
      expect(savedReturn.refundId).toBe("refund-1");
      expect(savedReturn.refundedCents).toBe(500);
    });
  });

  describe("sale status recompute", () => {
    it("marks the sale PARTIALLY_RETURNED when only some of a line is returned", async () => {
      vi.mocked(saleLineRepo.find).mockResolvedValue([fakeSaleLine({ quantity: 3 })]);
      await service.process(fakeTenant(), "sale-1", { reason: "one broke", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1");
      const savedSale = vi.mocked(salesRepo.save).mock.calls.at(-1)?.[0] as RetailSale;
      expect(savedSale.status).toBe(RetailSaleStatus.PARTIALLY_RETURNED);
    });

    it("marks the sale RETURNED when the whole line is returned", async () => {
      vi.mocked(saleLineRepo.find).mockResolvedValue([fakeSaleLine({ quantity: 1 })]);
      vi.mocked(saleLineRepo.findOne).mockResolvedValue(fakeSaleLine({ quantity: 1 }));
      await service.process(fakeTenant(), "sale-1", { reason: "all returned", lines: [{ saleLineId: "line-1", quantity: 1, disposition: RetailReturnDisposition.QUARANTINE }] }, "user-1");
      const savedSale = vi.mocked(salesRepo.save).mock.calls.at(-1)?.[0] as RetailSale;
      expect(savedSale.status).toBe(RetailSaleStatus.RETURNED);
    });
  });
});
