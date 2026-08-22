import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { GiftCardStatus } from "@salon/shared";
import { GiftCardService } from "./gift-card.service";
import { GiftCard } from "../entities/gift-card.entity";
import { Payment } from "../entities/payment.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { CustomerService } from "../customer/customer.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeTenant(): Tenant {
  return { id: "tenant-1", slug: "elegance", currency: "LKR" } as Tenant;
}

/** Comfortably in the future, so the standard "not expired" tests don't depend on today's date. */
const FAR_FUTURE = "2099-01-01";

function fakeCard(overrides: Partial<GiftCard> = {}): GiftCard {
  return {
    id: "gift-card-1",
    tenantId: "tenant-1",
    code: "ELE-GC-1234567890",
    initialValueCents: 10_000,
    remainingBalanceCents: 10_000,
    currency: "LKR",
    status: GiftCardStatus.ACTIVE,
    expiresAt: FAR_FUTURE,
    ...overrides,
  } as GiftCard;
}

describe("GiftCardService", () => {
  let giftCardsRepo: Repository<GiftCard>;
  let paymentsRepo: Repository<Payment>;
  let dataSource: DataSource;
  let customers: CustomerService;
  let audit: AuditService;
  let service: GiftCardService;
  let queryBuilderGetOne: ReturnType<typeof vi.fn>;
  let manager: EntityManager;

  beforeEach(() => {
    giftCardsRepo = mockRepo<GiftCard>();
    paymentsRepo = mockRepo<Payment>();
    queryBuilderGetOne = vi.fn(async () => fakeCard());

    const queryBuilder = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      getOne: queryBuilderGetOne,
      getMany: vi.fn(async () => []),
    };

    manager = {
      getRepository: (entity: unknown) => {
        if (entity === GiftCard) return { ...giftCardsRepo, createQueryBuilder: vi.fn(() => queryBuilder) };
        if (entity === Payment) return paymentsRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    customers = {
      findOrCreateForBooking: vi.fn(async () => ({ id: "customer-1", firstName: "Ruwani", lastName: "Perera", phone: "+94771234567" })),
    } as unknown as CustomerService;

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new GiftCardService(dataSource, giftCardsRepo, customers, audit);

    // `redeemExact`/`redeemUpTo` call `lockActiveCard`, which uses `manager.getRepository(GiftCard).createQueryBuilder()`
    // — patched onto the mock returned above, not the outer `giftCardsRepo`.
  });

  describe("create", () => {
    it("refuses a payment method that isn't cash/bank/card", async () => {
      await expect(
        service.create(
          fakeTenant(),
          {
            amountCents: 5000,
            expiresAt: FAR_FUTURE,
            purchaser: { firstName: "Ruwani", lastName: "Perera", phone: "+94771234567" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid for this test
            paymentMethod: "GIFT_CARD" as any,
          },
          "user-1",
          "idem-1",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("issues a card with the requested amount as both initial value and balance", async () => {
      const view = await service.create(
        fakeTenant(),
        {
          amountCents: 15_000,
          expiresAt: FAR_FUTURE,
          purchaser: { firstName: "Ruwani", lastName: "Perera", phone: "+94771234567" },
          message: "Happy birthday!",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paymentMethod: "CASH" as any,
        },
        "user-1",
        "idem-2",
      );
      expect(view.initialValueCents).toBe(15_000);
      expect(view.remainingBalanceCents).toBe(15_000);
      expect(view.message).toBe("Happy birthday!");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "GIFT_CARD_ISSUED" }),
        expect.anything(),
      );
    });

    it("is idempotent — a retried key returns the already-issued card, not a second one", async () => {
      const existingPayment = { id: "payment-1" } as Payment;
      const existingCard = fakeCard({ purchasePaymentId: "payment-1" });
      vi.mocked(paymentsRepo.findOne).mockResolvedValueOnce(existingPayment);
      vi.mocked(giftCardsRepo.findOne).mockResolvedValueOnce(existingCard);

      const view = await service.create(
        fakeTenant(),
        {
          amountCents: 15_000,
          expiresAt: FAR_FUTURE,
          purchaser: { firstName: "Ruwani", lastName: "Perera", phone: "+94771234567" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paymentMethod: "CASH" as any,
        },
        "user-1",
        "idem-repeat",
      );
      expect(view.id).toBe(existingCard.id);
      expect(customers.findOrCreateForBooking).not.toHaveBeenCalled();
    });
  });

  describe("redeemExact", () => {
    it("applies the exact amount when the balance covers it", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeCard({ remainingBalanceCents: 10_000 }));
      const result = await service.redeemExact(
        manager,
        "tenant-1",
        "ELE-GC-1234567890",
        4_000,
        { actorUserId: "user-1", appointmentId: "appt-1" },
      );
      expect(result.giftCardId).toBe("gift-card-1");
    });

    it("refuses when the balance is insufficient", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeCard({ remainingBalanceCents: 1_000 }));
      await expect(
        service.redeemExact(manager, "tenant-1", "ELE-GC-1234567890", 4_000, {
          actorUserId: "user-1",
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "GIFT_CARD_INSUFFICIENT_BALANCE" });
    });

    it("404s when no card matches the code for this tenant", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(null);
      await expect(
        service.redeemExact(manager, "tenant-1", "NOPE", 100, { actorUserId: null, appointmentId: "appt-1" }),
      ).rejects.toMatchObject({ code: "GIFT_CARD_NOT_FOUND" });
    });

    it("refuses a voided card", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeCard({ status: GiftCardStatus.VOID }));
      await expect(
        service.redeemExact(manager, "tenant-1", "ELE-GC-1234567890", 100, {
          actorUserId: null,
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "GIFT_CARD_VOID" });
    });

    it("refuses an already-fully-redeemed card", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(
        fakeCard({ status: GiftCardStatus.REDEEMED, remainingBalanceCents: 0 }),
      );
      await expect(
        service.redeemExact(manager, "tenant-1", "ELE-GC-1234567890", 100, {
          actorUserId: null,
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "GIFT_CARD_ALREADY_REDEEMED" });
    });

    it("refuses an expired card", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeCard({ expiresAt: "2000-01-01" }));
      await expect(
        service.redeemExact(manager, "tenant-1", "ELE-GC-1234567890", 100, {
          actorUserId: null,
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "GIFT_CARD_EXPIRED" });
    });
  });

  describe("redeemUpTo", () => {
    it("applies the full request when the balance covers it", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeCard({ remainingBalanceCents: 10_000 }));
      const result = await service.redeemUpTo(manager, "tenant-1", "ELE-GC-1234567890", 3_000, {
        actorUserId: null,
        appointmentId: "appt-1",
      });
      expect(result.appliedCents).toBe(3_000);
    });

    it("caps the applied amount at the remaining balance, never more", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakeCard({ remainingBalanceCents: 1_500 }));
      const result = await service.redeemUpTo(manager, "tenant-1", "ELE-GC-1234567890", 3_000, {
        actorUserId: null,
        appointmentId: "appt-1",
      });
      expect(result.appliedCents).toBe(1_500);
    });
  });

  describe("void", () => {
    it("refuses a card that is already void", async () => {
      vi.mocked(giftCardsRepo.findOne).mockResolvedValueOnce(fakeCard({ status: GiftCardStatus.VOID }));
      await expect(service.void("tenant-1", "gift-card-1", "user-1", "mistake")).rejects.toMatchObject({
        code: "GIFT_CARD_ALREADY_VOID",
      });
    });

    it("voids an active card with a remaining balance", async () => {
      vi.mocked(giftCardsRepo.findOne).mockResolvedValue(fakeCard({ remainingBalanceCents: 6_000 }));
      const view = await service.void("tenant-1", "gift-card-1", "user-1", "customer changed their mind");
      expect(view.status).toBe(GiftCardStatus.VOID);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "GIFT_CARD_VOIDED" }));
    });
  });

  describe("preview", () => {
    it("is a pure read — never calls save", async () => {
      vi.mocked(giftCardsRepo.findOne).mockResolvedValueOnce(fakeCard({ remainingBalanceCents: 7_500 }));
      const result = await service.preview("tenant-1", "ELE-GC-1234567890");
      expect(result.remainingBalanceCents).toBe(7_500);
      expect(giftCardsRepo.save).not.toHaveBeenCalled();
    });
  });
});
