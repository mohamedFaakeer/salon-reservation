import type { ObjectLiteral, Repository } from "typeorm";
import { CustomerService } from "./customer.service";
import type { Customer } from "../entities/customer.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findAndCount: vi.fn(async () => [[] as T[], 0] as [T[], number]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

describe("CustomerService", () => {
  let customers: Repository<Customer>;
  let service: CustomerService;

  beforeEach(() => {
    customers = mockRepo<Customer>();
    service = new CustomerService(customers);
  });

  describe("search", () => {
    it("honours the limit and offset its DTO declares", async () => {
      // These used to be dropped for a hardcoded take: 50, so a salon with
      // more than fifty customers could never reach the rest of them.
      await service.search("tenant-1", { limit: 20, offset: 40 });

      const args = vi.mocked(customers.findAndCount).mock.calls[0][0];
      expect(args).toMatchObject({ take: 20, skip: 40 });
    });

    it("reports the unpaged total alongside the page", async () => {
      vi.mocked(customers.findAndCount).mockResolvedValueOnce([
        [{ id: "c1" } as Customer],
        214,
      ]);

      const result = await service.search("tenant-1", { limit: 50, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 214, limit: 50, offset: 0 });
    });

    it("matches names regardless of case", async () => {
      // Postgres LIKE is case-sensitive, so searching "ayesha" found nobody
      // called "Ayesha" — every customer, in practice.
      await service.search("tenant-1", { limit: 50, offset: 0, q: "ayesha" });

      // TypeORM records the operator on the FindOperator itself; "like" here
      // would mean the case-sensitive match is back.
      const where = vi.mocked(customers.findAndCount).mock.calls[0][0]?.where;
      const operators = (where as Array<Record<string, { type?: string }>>).map(
        (clause) => Object.values(clause).find((v) => typeof v === "object")?.type,
      );
      expect(operators).toEqual(["ilike", "ilike", "ilike"]);
    });

    it("lists newest first when no query is given", async () => {
      await service.search("tenant-1", { limit: 50, offset: 0 });

      const args = vi.mocked(customers.findAndCount).mock.calls[0][0];
      expect(args).toMatchObject({ order: { createdAt: "DESC" } });
    });
  });

  describe("create", () => {
    it("normalizes the phone and persists with the caller's tenantId", async () => {
      await service.create("tenant-1", {
        firstName: "Amaya",
        lastName: "Perera",
        phone: "077 123 4567",
      });

      const created = vi.mocked(customers.create).mock.calls[0][0] as Customer;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.phone).toBe("0771234567");
    });

    it("throws DUPLICATE_CUSTOMER on a phone match", async () => {
      vi.mocked(customers.findOne).mockResolvedValueOnce({ id: "existing-1" } as Customer);

      await expect(
        service.create("tenant-1", { firstName: "Amaya", lastName: "Perera", phone: "0771234567" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_CUSTOMER" });
    });

    it("throws DUPLICATE_CUSTOMER on an email match when phone is new", async () => {
      vi.mocked(customers.findOne)
        .mockResolvedValueOnce(null) // phone check
        .mockResolvedValueOnce({ id: "existing-2" } as Customer); // email check

      await expect(
        service.create("tenant-1", {
          firstName: "Amaya",
          lastName: "Perera",
          phone: "0771234567",
          email: "amaya@example.com",
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_CUSTOMER" });
    });
  });

  describe("findOrCreateForBooking", () => {
    it("returns the existing customer on a phone match without creating a new one", async () => {
      const existing = { id: "existing-1", phone: "0771234567" } as Customer;
      vi.mocked(customers.findOne).mockResolvedValue(existing);

      const result = await service.findOrCreateForBooking("tenant-1", {
        firstName: "Amaya",
        lastName: "Perera",
        phone: "077 123 4567",
      });

      expect(result).toBe(existing);
      expect(customers.save).not.toHaveBeenCalled();
    });

    it("creates a new customer when no phone match exists", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(null);

      await service.findOrCreateForBooking("tenant-1", {
        firstName: "Amaya",
        lastName: "Perera",
        phone: "0771234567",
      });

      expect(customers.save).toHaveBeenCalled();
    });

    it("drops a colliding email and retries, rather than blocking the booking", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(null); // no phone match
      vi.mocked(customers.save)
        .mockRejectedValueOnce(Object.assign(new Error("unique violation"), { code: "23505" }))
        .mockResolvedValueOnce({ id: "new-1" } as Customer);

      const result = await service.findOrCreateForBooking("tenant-1", {
        firstName: "Amaya",
        lastName: "Perera",
        phone: "0771234567",
        email: "shared@example.com",
      });

      expect(result).toEqual({ id: "new-1" });
      const secondAttempt = vi.mocked(customers.create).mock.calls[1][0] as Customer;
      expect(secondAttempt.email).toBeNull();
    });
  });

  describe("findById", () => {
    it("throws CUSTOMER_NOT_FOUND for a cross-tenant id", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(null);

      await expect(service.findById("tenant-1", "cust-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
      });
    });
  });
});
