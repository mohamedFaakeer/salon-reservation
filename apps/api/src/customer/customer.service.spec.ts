import type { ObjectLiteral, Repository } from "typeorm";
import { CustomerService } from "./customer.service";
import { AppointmentStatus } from "@salon/shared";
import type { Customer } from "../entities/customer.entity";
import type { Appointment } from "../entities/appointment.entity";
import type { AppointmentServiceLine } from "../entities/appointment-service.entity";
import type { Payment } from "../entities/payment.entity";
import type { Rating } from "../entities/rating.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findAndCount: vi.fn(async () => [[] as T[], 0] as [T[], number]),
    findOne: vi.fn(async () => null as T | null),
    createQueryBuilder: vi.fn(() => queryBuilder([])),
  } as unknown as Repository<T>;
}

/**
 * Chainable query-builder stub. `stats` runs four aggregates in parallel, so
 * each test seeds the rows it cares about and leaves the rest empty.
 */
function queryBuilder(rows: unknown[], one: unknown = null) {
  const qb: Record<string, unknown> = {};
  for (const method of [
    "select",
    "addSelect",
    "where",
    "andWhere",
    "innerJoin",
    "groupBy",
    "orderBy",
    "limit",
  ]) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getRawMany = vi.fn(async () => rows);
  qb.getRawOne = vi.fn(async () => one);
  return qb;
}

describe("CustomerService", () => {
  let customers: Repository<Customer>;
  let appointments: Repository<Appointment>;
  let lines: Repository<AppointmentServiceLine>;
  let payments: Repository<Payment>;
  let ratings: Repository<Rating>;
  let service: CustomerService;

  beforeEach(() => {
    customers = mockRepo<Customer>();
    appointments = mockRepo<Appointment>();
    lines = mockRepo<AppointmentServiceLine>();
    payments = mockRepo<Payment>();
    ratings = mockRepo<Rating>();
    service = new CustomerService(customers, appointments, lines, payments, ratings);
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

  describe("stats", () => {
    function seed({
      statuses = [] as Array<{ status: AppointmentStatus; count: number }>,
      spent = 0,
      rating = { average: null as string | null, count: 0 },
      services = [] as Array<{ name: string; count: number }>,
      dates = { first: null as string | null, last: null as string | null },
    }) {
      vi.mocked(customers.findOne).mockResolvedValue({ id: "c1", tenantId: "t1" } as Customer);
      // Two aggregates run off the appointment repo: the status grouping first,
      // then the first/last visit dates.
      vi.mocked(appointments.createQueryBuilder)
        .mockReturnValueOnce(queryBuilder(statuses) as never)
        .mockReturnValueOnce(queryBuilder([], dates) as never);
      vi.mocked(payments.createQueryBuilder).mockReturnValue(
        queryBuilder([], { total: spent }) as never,
      );
      vi.mocked(lines.createQueryBuilder).mockReturnValue(queryBuilder(services) as never);
      vi.mocked(ratings.createQueryBuilder).mockReturnValue(queryBuilder([], rating) as never);
    }

    it("counts visits, cancellations and no-shows from one grouped query", async () => {
      seed({
        statuses: [
          { status: AppointmentStatus.COMPLETED, count: 7 },
          { status: AppointmentStatus.CANCELLED, count: 2 },
          { status: AppointmentStatus.NO_SHOW, count: 1 },
        ],
      });

      const result = await service.stats("t1", "c1");

      expect(result.visits).toBe(7);
      expect(result.cancellations).toBe(2);
      expect(result.noShows).toBe(1);
      expect(result.totalBookings).toBe(10);
    });

    it("rates reliability over concluded appointments only", async () => {
      // 1 missed out of 4 that actually resolved. Future bookings are not
      // evidence either way and must not dilute the ratio.
      seed({
        statuses: [
          { status: AppointmentStatus.COMPLETED, count: 3 },
          { status: AppointmentStatus.NO_SHOW, count: 1 },
          { status: AppointmentStatus.CONFIRMED, count: 5 },
        ],
      });

      const result = await service.stats("t1", "c1");

      expect(result.noShowRate).toBe(25);
    });

    it("has no rate to report for a customer who has never concluded a booking", async () => {
      seed({ statuses: [{ status: AppointmentStatus.CONFIRMED, count: 1 }] });

      const result = await service.stats("t1", "c1");

      // Null, not zero: zero would claim a perfect record they have not earned.
      expect(result.noShowRate).toBeNull();
    });

    it("counts bookings that are on the books but have not happened yet", async () => {
      // The screen uses this to tell "never been in" apart from "coming in on
      // Thursday". Both have zero visits; only one is an empty record.
      seed({
        statuses: [
          { status: AppointmentStatus.CONFIRMED, count: 2 },
          { status: AppointmentStatus.CHECKED_IN, count: 1 },
          { status: AppointmentStatus.IN_SERVICE, count: 1 },
        ],
      });

      const result = await service.stats("t1", "c1");

      expect(result.upcoming).toBe(4);
      expect(result.visits).toBe(0);
    });

    it("does not count an unpaid or abandoned attempt as upcoming", async () => {
      // PENDING_PAYMENT expires on its own and EXPIRED already has; neither is
      // a booking anyone at the salon is expecting to see walk in.
      seed({
        statuses: [
          { status: AppointmentStatus.PENDING_PAYMENT, count: 3 },
          { status: AppointmentStatus.EXPIRED, count: 2 },
          { status: AppointmentStatus.RESCHEDULED, count: 1 },
        ],
      });

      const result = await service.stats("t1", "c1");

      expect(result.upcoming).toBe(0);
      // Still part of the raw total — the rows exist, they are just not a promise.
      expect(result.totalBookings).toBe(6);
    });

    it("reports nothing upcoming for a customer with no bookings at all", async () => {
      seed({});

      const result = await service.stats("t1", "c1");

      expect(result.upcoming).toBe(0);
      expect(result.totalBookings).toBe(0);
    });

    it("reports money received, not money billed", async () => {
      seed({ spent: 412500 });

      const result = await service.stats("t1", "c1");

      expect(result.totalSpentCents).toBe(412500);
    });

    it("returns the services they actually book, most frequent first", async () => {
      seed({
        services: [
          { name: "Women's Haircut", count: 5 },
          { name: "Facial", count: 2 },
        ],
      });

      const result = await service.stats("t1", "c1");

      expect(result.services).toEqual([
        { name: "Women's Haircut", count: 5 },
        { name: "Facial", count: 2 },
      ]);
    });

    it("refuses a customer belonging to another salon", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(null);

      await expect(service.stats("t1", "someone-elses-customer")).rejects.toMatchObject({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
      });
    });

    it("averages the ratings they have left", async () => {
      seed({ rating: { average: "4.3333", count: 3 } });

      const result = await service.stats("t1", "c1");

      expect(result.averageRating).toBe(4.3);
      expect(result.ratingCount).toBe(3);
    });

    it("has no average for a customer who has never rated", async () => {
      seed({});

      const result = await service.stats("t1", "c1");

      // Zero out of five would be the worst score there is; null says unrated.
      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
    });
  });

  describe("getUnsubscribeInfo / unsubscribeFromMarketing (DECISIONS.md §43, public link)", () => {
    function fakeCustomerWithTenant(overrides: Partial<Customer> = {}): Customer {
      return {
        id: "cust-1",
        tenantId: "tenant-1",
        firstName: "Sanduni",
        marketingOptOut: false,
        tenant: { id: "tenant-1", name: "Elegance Salon" },
        ...overrides,
      } as Customer;
    }

    it("404s with a link-specific message when the id doesn't resolve — no tenantId required, unlike findById", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(null);
      await expect(service.getUnsubscribeInfo("missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
      });
      // Confirms the lookup is by id alone — no tenantId in the where clause.
      expect(customers.findOne).toHaveBeenCalledWith({ where: { id: "missing" }, relations: { tenant: true } });
    });

    it("reports whether the customer has already opted out, without changing anything", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(fakeCustomerWithTenant({ marketingOptOut: true }));

      const info = await service.getUnsubscribeInfo("cust-1");

      expect(info).toEqual({ customerFirstName: "Sanduni", salonName: "Elegance Salon", alreadyOptedOut: true });
      expect(customers.save).not.toHaveBeenCalled();
    });

    it("sets marketingOptOut on confirm", async () => {
      const customer = fakeCustomerWithTenant({ marketingOptOut: false });
      vi.mocked(customers.findOne).mockResolvedValue(customer);

      const result = await service.unsubscribeFromMarketing("cust-1");

      expect(customers.save).toHaveBeenCalledWith(expect.objectContaining({ marketingOptOut: true }));
      expect(result).toEqual({ customerFirstName: "Sanduni", salonName: "Elegance Salon" });
    });

    it("is idempotent — confirming an already-opted-out customer doesn't write again", async () => {
      vi.mocked(customers.findOne).mockResolvedValue(fakeCustomerWithTenant({ marketingOptOut: true }));

      await service.unsubscribeFromMarketing("cust-1");

      expect(customers.save).not.toHaveBeenCalled();
    });
  });
});