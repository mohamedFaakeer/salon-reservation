import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { ServicePackageStatus } from "@salon/shared";
import { ServicePackageService } from "./service-package.service";
import { ServicePackage } from "../entities/service-package.entity";
import { Payment } from "../entities/payment.entity";
import type { Service } from "../entities/service.entity";
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

function fakeService(overrides: Partial<Service> = {}): Service {
  return { id: "service-1", tenantId: "tenant-1", name: "Gel Manicure", priceCents: 2_200, active: true, ...overrides } as Service;
}

/** Comfortably in the future, so the standard "not expired" tests don't depend on today's date. */
const FAR_FUTURE = "2099-01-01";

function fakePackage(overrides: Partial<ServicePackage> = {}): ServicePackage {
  return {
    id: "package-1",
    tenantId: "tenant-1",
    code: "ELE-PKG-1234567890",
    serviceId: "service-1",
    serviceNameSnapshot: "Gel Manicure",
    unitPriceCentsSnapshot: 2_200,
    totalUses: 5,
    remainingUses: 5,
    purchasePriceCents: 10_000,
    status: ServicePackageStatus.ACTIVE,
    expiresAt: FAR_FUTURE,
    ...overrides,
  } as ServicePackage;
}

describe("ServicePackageService", () => {
  let packagesRepo: Repository<ServicePackage>;
  let paymentsRepo: Repository<Payment>;
  let servicesRepo: Repository<Service>;
  let dataSource: DataSource;
  let customers: CustomerService;
  let audit: AuditService;
  let service: ServicePackageService;
  let queryBuilderGetOne: ReturnType<typeof vi.fn>;
  let manager: EntityManager;

  beforeEach(() => {
    packagesRepo = mockRepo<ServicePackage>();
    paymentsRepo = mockRepo<Payment>();
    servicesRepo = { ...mockRepo<Service>(), findOne: vi.fn(async () => fakeService()) } as unknown as Repository<Service>;
    queryBuilderGetOne = vi.fn(async () => fakePackage());

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
        if (entity === ServicePackage) return { ...packagesRepo, createQueryBuilder: vi.fn(() => queryBuilder) };
        if (entity === Payment) return paymentsRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    customers = {
      findOrCreateForBooking: vi.fn(async () => ({ id: "customer-1", firstName: "Chamari", lastName: "Silva", phone: "+94771234567" })),
    } as unknown as CustomerService;

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new ServicePackageService(dataSource, packagesRepo, servicesRepo, customers, audit);
  });

  describe("create", () => {
    it("refuses a payment method that isn't cash/bank/card", async () => {
      await expect(
        service.create(
          fakeTenant(),
          {
            serviceId: "service-1",
            totalUses: 5,
            purchasePriceCents: 10_000,
            expiresAt: FAR_FUTURE,
            customer: { firstName: "Chamari", lastName: "Silva", phone: "+94771234567" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid for this test
            paymentMethod: "GIFT_CARD" as any,
          },
          "user-1",
          "idem-1",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("404s when the service doesn't exist for this tenant", async () => {
      vi.mocked(servicesRepo.findOne).mockResolvedValueOnce(null);
      await expect(
        service.create(
          fakeTenant(),
          {
            serviceId: "nope",
            totalUses: 5,
            purchasePriceCents: 10_000,
            expiresAt: FAR_FUTURE,
            customer: { firstName: "Chamari", lastName: "Silva", phone: "+94771234567" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            paymentMethod: "CASH" as any,
          },
          "user-1",
          "idem-2",
        ),
      ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
    });

    it("snapshots the service's current name/price and starts remainingUses at totalUses", async () => {
      const view = await service.create(
        fakeTenant(),
        {
          serviceId: "service-1",
          totalUses: 5,
          purchasePriceCents: 10_000,
          expiresAt: FAR_FUTURE,
          customer: { firstName: "Chamari", lastName: "Silva", phone: "+94771234567" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paymentMethod: "CASH" as any,
        },
        "user-1",
        "idem-3",
      );
      expect(view.serviceNameSnapshot).toBe("Gel Manicure");
      expect(view.unitPriceCentsSnapshot).toBe(2_200);
      expect(view.totalUses).toBe(5);
      expect(view.remainingUses).toBe(5);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "SERVICE_PACKAGE_ISSUED" }),
        expect.anything(),
      );
    });

    it("is idempotent — a retried key returns the already-issued package, not a second one", async () => {
      const existingPayment = { id: "payment-1" } as Payment;
      const existingPackage = fakePackage({ purchasePaymentId: "payment-1" });
      vi.mocked(paymentsRepo.findOne).mockResolvedValueOnce(existingPayment);
      vi.mocked(packagesRepo.findOne).mockResolvedValueOnce(existingPackage);

      const view = await service.create(
        fakeTenant(),
        {
          serviceId: "service-1",
          totalUses: 5,
          purchasePriceCents: 10_000,
          expiresAt: FAR_FUTURE,
          customer: { firstName: "Chamari", lastName: "Silva", phone: "+94771234567" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paymentMethod: "CASH" as any,
        },
        "user-1",
        "idem-repeat",
      );
      expect(view.id).toBe(existingPackage.id);
      expect(customers.findOrCreateForBooking).not.toHaveBeenCalled();
    });
  });

  describe("redeemOne", () => {
    it("applies min(unitPriceCentsSnapshot, maxCents) and consumes exactly one use", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakePackage({ remainingUses: 5, unitPriceCentsSnapshot: 2_200 }));
      const result = await service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-1"], 5_000, {
        actorUserId: "user-1",
        appointmentId: "appt-1",
      });
      expect(result.appliedCents).toBe(2_200);
      expect(result.packageId).toBe("package-1");
    });

    it("caps the applied amount at the unit price, never more", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakePackage({ unitPriceCentsSnapshot: 2_200 }));
      const result = await service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-1"], 1_000, {
        actorUserId: "user-1",
        appointmentId: "appt-1",
      });
      expect(result.appliedCents).toBe(1_000);
    });

    it("flips to DEPLETED when the last use is redeemed", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakePackage({ remainingUses: 1 }));
      await service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-1"], 2_200, {
        actorUserId: "user-1",
        appointmentId: "appt-1",
      });
      expect(packagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ remainingUses: 0, status: ServicePackageStatus.DEPLETED }),
      );
    });

    it("refuses when the booked services don't include the package's own service", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakePackage({ serviceId: "service-1" }));
      await expect(
        service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-2"], 2_200, {
          actorUserId: "user-1",
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "PACKAGE_SERVICE_MISMATCH" });
    });

    it("404s when no package matches the code for this tenant", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(null);
      await expect(
        service.redeemOne(manager, "tenant-1", "NOPE", ["service-1"], 100, { actorUserId: null, appointmentId: "appt-1" }),
      ).rejects.toMatchObject({ code: "SERVICE_PACKAGE_NOT_FOUND" });
    });

    it("refuses a voided package", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakePackage({ status: ServicePackageStatus.VOID }));
      await expect(
        service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-1"], 100, {
          actorUserId: null,
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "SERVICE_PACKAGE_VOID" });
    });

    it("refuses an already-depleted package", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(
        fakePackage({ status: ServicePackageStatus.DEPLETED, remainingUses: 0 }),
      );
      await expect(
        service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-1"], 100, {
          actorUserId: null,
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "SERVICE_PACKAGE_DEPLETED" });
    });

    it("refuses an expired package", async () => {
      queryBuilderGetOne.mockResolvedValueOnce(fakePackage({ expiresAt: "2000-01-01" }));
      await expect(
        service.redeemOne(manager, "tenant-1", "ELE-PKG-1234567890", ["service-1"], 100, {
          actorUserId: null,
          appointmentId: "appt-1",
        }),
      ).rejects.toMatchObject({ code: "SERVICE_PACKAGE_EXPIRED" });
    });
  });

  describe("void", () => {
    it("refuses a package that is already void", async () => {
      vi.mocked(packagesRepo.findOne).mockResolvedValueOnce(fakePackage({ status: ServicePackageStatus.VOID }));
      await expect(service.void("tenant-1", "package-1", "user-1", "mistake")).rejects.toMatchObject({
        code: "SERVICE_PACKAGE_ALREADY_VOID",
      });
    });

    it("voids an active package with uses remaining", async () => {
      vi.mocked(packagesRepo.findOne).mockResolvedValue(fakePackage({ remainingUses: 3 }));
      const view = await service.void("tenant-1", "package-1", "user-1", "customer requested a refund");
      expect(view.status).toBe(ServicePackageStatus.VOID);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SERVICE_PACKAGE_VOIDED" }));
    });
  });

  describe("preview", () => {
    it("is a pure read — never calls save", async () => {
      vi.mocked(packagesRepo.findOne).mockResolvedValueOnce(fakePackage({ remainingUses: 4 }));
      const result = await service.preview("tenant-1", "ELE-PKG-1234567890");
      expect(result.remainingUses).toBe(4);
      expect(packagesRepo.save).not.toHaveBeenCalled();
    });
  });
});
