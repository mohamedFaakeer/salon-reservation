import type { EntityManager, ObjectLiteral, Repository } from "typeorm";
import { StockMovementType } from "@salon/shared";
import { StockMutationService } from "./stock-mutation.service";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockMovement } from "../entities/stock-movement.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "variant-1",
    tenantId: "tenant-1",
    sku: "SHMP-400",
    quantityOnHand: 10,
    ...overrides,
  } as ProductVariant;
}

describe("StockMutationService", () => {
  let variantsRepo: Repository<ProductVariant>;
  let movementsRepo: Repository<StockMovement>;
  let queryBuilderGetOne: ReturnType<typeof vi.fn>;
  let manager: EntityManager;
  let service: StockMutationService;

  beforeEach(() => {
    variantsRepo = mockRepo<ProductVariant>();
    movementsRepo = mockRepo<StockMovement>();
    queryBuilderGetOne = vi.fn(async () => fakeVariant());

    const queryBuilder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: queryBuilderGetOne,
    };

    manager = {
      getRepository: (entity: unknown) => {
        if (entity === ProductVariant) return { ...variantsRepo, createQueryBuilder: vi.fn(() => queryBuilder) };
        if (entity === StockMovement) return movementsRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    service = new StockMutationService();
  });

  describe("lockVariant", () => {
    it("404s when no variant matches for this tenant", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(null);
      await expect(service.lockVariant(manager, "tenant-1", "missing")).rejects.toMatchObject({
        code: "PRODUCT_VARIANT_NOT_FOUND",
      });
    });

    it("returns the locked variant row", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeVariant({ id: "variant-9" }));
      const result = await service.lockVariant(manager, "tenant-1", "variant-9");
      expect(result.id).toBe("variant-9");
    });
  });

  describe("applyMovement", () => {
    it("decrements quantityOnHand and writes a matching ledger row", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeVariant({ quantityOnHand: 10 }));
      const result = await service.applyMovement(manager, {
        tenantId: "tenant-1",
        variantId: "variant-1",
        type: StockMovementType.SALE,
        quantityDelta: -3,
        actorUserId: "user-1",
      });
      expect(result.quantityOnHand).toBe(7);
      const savedMovement = vi.mocked(movementsRepo.save).mock.calls[0][0] as StockMovement;
      expect(savedMovement.quantityDelta).toBe(-3);
      expect(savedMovement.quantityAfter).toBe(7);
      expect(savedMovement.type).toBe(StockMovementType.SALE);
    });

    it("increments quantityOnHand for a positive delta (receipt)", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeVariant({ quantityOnHand: 5 }));
      const result = await service.applyMovement(manager, {
        tenantId: "tenant-1",
        variantId: "variant-1",
        type: StockMovementType.RECEIPT,
        quantityDelta: 20,
        actorUserId: "user-1",
      });
      expect(result.quantityOnHand).toBe(25);
    });

    it("refuses a delta that would take quantityOnHand negative — never clamps to zero", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeVariant({ quantityOnHand: 2 }));
      await expect(
        service.applyMovement(manager, {
          tenantId: "tenant-1",
          variantId: "variant-1",
          type: StockMovementType.SALE,
          quantityDelta: -5,
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "INSUFFICIENT_STOCK" });
      expect(movementsRepo.save).not.toHaveBeenCalled();
    });

    it("records the batchId on the ledger row when one is supplied", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeVariant({ quantityOnHand: 10 }));
      await service.applyMovement(manager, {
        tenantId: "tenant-1",
        variantId: "variant-1",
        batchId: "batch-1",
        type: StockMovementType.SALE,
        quantityDelta: -1,
        actorUserId: "user-1",
      });
      const savedMovement = vi.mocked(movementsRepo.save).mock.calls[0][0] as StockMovement;
      expect(savedMovement.batchId).toBe("batch-1");
    });
  });
});
