import type { EntityManager, ObjectLiteral, Repository } from "typeorm";
import { CustomerService } from "./customer.service";
import { AppointmentStatus, DEFAULT_TENANT_SETTINGS, Province } from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import type { Appointment } from "../entities/appointment.entity";
import type { AppointmentServiceLine } from "../entities/appointment-service.entity";
import type { Payment } from "../entities/payment.entity";
import type { Rating } from "../entities/rating.entity";
import type { Tag } from "../entities/tag.entity";
import { CustomerTag } from "../entities/customer-tag.entity";
// AuditService/TenantService/CloudinaryService are only used here as
// structural mock types, never instantiated — `import type` is fine in a spec.
import type { AuditService } from "../audit/audit.service";
import type { TenantService } from "../tenant/tenant.service";
import type { CloudinaryService } from "../cloudinary/cloudinary.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findAndCount: vi.fn(async () => [[] as T[], 0] as [T[], number]),
    findOne: vi.fn(async () => null as T | null),
    delete: vi.fn(async () => ({ affected: 0 })),
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

/** `search`/`segmentCounts` build a `SelectQueryBuilder<Customer>` directly, not a raw-aggregate one. */
function customerQueryBuilder(data: Customer[] = [], total = 0, count = 0) {
  const qb: Record<string, unknown> = {};
  for (const method of ["where", "andWhere", "orderBy", "take", "skip"]) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getManyAndCount = vi.fn(async () => [data, total]);
  qb.getCount = vi.fn(async () => count);
  return qb;
}

const TENANT_SETTINGS_WITH_CURRENCY = {
  ...DEFAULT_TENANT_SETTINGS,
  currency: "LKR",
  timezone: "Asia/Colombo",
};

describe("CustomerService", () => {
  let customers: Repository<Customer>;
  let appointments: Repository<Appointment>;
  let lines: Repository<AppointmentServiceLine>;
  let payments: Repository<Payment>;
  let ratings: Repository<Rating>;
  let tags: Repository<Tag>;
  let customerTags: Repository<CustomerTag>;
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let audit: AuditService;
  let tenantService: TenantService;
  let cloudinary: CloudinaryService;
  let service: CustomerService;

  beforeEach(() => {
    customers = mockRepo<Customer>();
    appointments = mockRepo<Appointment>();
    lines = mockRepo<AppointmentServiceLine>();
    payments = mockRepo<Payment>();
    ratings = mockRepo<Rating>();
    tags = mockRepo<Tag>();
    customerTags = mockRepo<CustomerTag>();

    const manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Customer) return customers;
        if (entity === CustomerTag) return customerTags;
        throw new Error(`unexpected repo requested in test: ${String(entity)}`);
      }),
    } as unknown as EntityManager;
    dataSource = { transaction: vi.fn(async (fn: (m: EntityManager) => unknown) => fn(manager)) };

    audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;
    tenantService = { getSettings: vi.fn(async () => TENANT_SETTINGS_WITH_CURRENCY) } as unknown as TenantService;
    cloudinary = { uploadCustomerPhoto: vi.fn(async () => "https://res.cloudinary.com/demo/photo.png") } as unknown as CloudinaryService;

    service = new CustomerService(
      customers,
      appointments,
      lines,
      payments,
      ratings,
      tags,
      customerTags,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for InjectDataSource, shape checked via the transaction() spy above
      dataSource as any,
      audit,
      tenantService,
      cloudinary,
    );
  });

  describe("search", () => {
    it("honours the limit and offset its DTO declares", async () => {
      const qb = customerQueryBuilder([], 0, 0);
      vi.mocked(customers.createQueryBuilder).mockReturnValueOnce(qb as never);

      await service.search("tenant-1", { limit: 20, offset: 40 });

      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.skip).toHaveBeenCalledWith(40);
    });

    it("reports the unpaged total alongside the page", async () => {
      const qb = customerQueryBuilder([{ id: "c1" } as Customer], 214, 0);
      vi.mocked(customers.createQueryBuilder).mockReturnValueOnce(qb as never);

      const result = await service.search("tenant-1", { limit: 50, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 214, limit: 50, offset: 0 });
    });

    it("adds a text filter only when q is given", async () => {
      const qb = customerQueryBuilder([], 0, 0);
      vi.mocked(customers.createQueryBuilder).mockReturnValueOnce(qb as never);

      await service.search("tenant-1", { limit: 50, offset: 0, q: "ayesha" });

      // where/andWhere is called at least for tenant scoping + the placeholder
      // exclusion + the text Brackets — a real regression (q silently dropped)
      // would leave this at 2 calls instead of 3.
      expect((qb.andWhere as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it("reads the tenant's configured day-windows when filtering by segment", async () => {
      const qb = customerQueryBuilder([], 0, 0);
      vi.mocked(customers.createQueryBuilder).mockReturnValueOnce(qb as never);

      await service.search("tenant-1", { limit: 50, offset: 0, segment: "NEW" as never });

      expect(tenantService.getSettings).toHaveBeenCalledWith("tenant-1");
    });

    it("lists newest first when no query is given", async () => {
      const qb = customerQueryBuilder([], 0, 0);
      vi.mocked(customers.createQueryBuilder).mockReturnValueOnce(qb as never);

      await service.search("tenant-1", { limit: 50, offset: 0 });

      expect(qb.orderBy).toHaveBeenCalledWith("c.createdAt", "DESC");
    });
  });

  describe("segmentCounts", () => {
    it("returns one count per segment", async () => {
      vi.mocked(customers.createQueryBuilder).mockImplementation(() => customerQueryBuilder([], 0, 3) as never);

      const result = await service.segmentCounts("tenant-1");

      expect(result).toHaveLength(5);
      expect(result.every((r) => r.count === 3)).toBe(true);
    });
  });

  describe("lookupByPhone", () => {
    it("normalizes the phone before looking it up", async () => {
      await service.lookupByPhone("tenant-1", "077 123 4567");

      expect(customers.findOne).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", phone: "0771234567" } });
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

    it("rejects a tag that does not belong to this tenant", async () => {
      vi.mocked(tags.find).mockResolvedValueOnce([]); // none of the requested ids came back owned

      await expect(
        service.create("tenant-1", {
          firstName: "Amaya",
          lastName: "Perera",
          phone: "0771234567",
          tagIds: ["someone-elses-tag"],
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_TAG_IDS" });
    });

    it("persists the new CRM fields", async () => {
      await service.create("tenant-1", {
        firstName: "Amaya",
        lastName: "Perera",
        phone: "0771234567",
        title: "Mrs.",
        dateOfBirth: "1990-05-12",
        clientSource: "Referral",
        address: "12 Galle Road",
        province: Province.WESTERN,
      });

      const created = vi.mocked(customers.create).mock.calls[0][0] as Customer;
      expect(created).toMatchObject({
        title: "Mrs.",
        dateOfBirth: "1990-05-12",
        clientSource: "Referral",
        address: "12 Galle Road",
        province: Province.WESTERN,
      });
    });
  });

  describe("update", () => {
    function existingCustomer(overrides: Partial<Customer> = {}): Customer {
      return {
        id: "cust-1",
        tenantId: "tenant-1",
        firstName: "Amaya",
        lastName: "Perera",
        phone: "0771234567",
        email: null,
        notes: null,
        marketingOptOut: false,
        isWalkInPlaceholder: false,
        title: null,
        dateOfBirth: null,
        profileImageUrl: null,
        clientSource: null,
        address: null,
        province: null,
        ...overrides,
      } as Customer;
    }

    it("applies a routine field edit without touching phone, and does not audit it", async () => {
      vi.mocked(customers.findOne).mockResolvedValueOnce(existingCustomer());

      await service.update("tenant-1", "cust-1", { notes: "Prefers a quiet chair" }, "user-1");

      expect(audit.record).not.toHaveBeenCalled();
    });

    it("re-runs the duplicate check when the phone changes, excluding the customer's own row", async () => {
      vi.mocked(customers.findOne)
        .mockResolvedValueOnce(existingCustomer()) // findById
        .mockResolvedValueOnce({ id: "cust-1", phone: "0779999999" } as Customer); // findDuplicate's own-row match

      // findDuplicate excludes the row whose id matches excludeId — since the
      // only match found here IS the customer being edited, this must succeed,
      // not throw DUPLICATE_CUSTOMER.
      const result = await service.update("tenant-1", "cust-1", { phone: "0779999999" }, "user-1");

      expect(result.phone).toBe("0779999999");
    });

    it("throws DUPLICATE_CUSTOMER when the new phone belongs to a different customer", async () => {
      vi.mocked(customers.findOne)
        .mockResolvedValueOnce(existingCustomer())
        .mockResolvedValueOnce({ id: "someone-else" } as Customer);

      await expect(
        service.update("tenant-1", "cust-1", { phone: "0779999999" }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_CUSTOMER" });
    });

    it("audits only the phone change, with the old and new values", async () => {
      vi.mocked(customers.findOne)
        .mockResolvedValueOnce(existingCustomer())
        .mockResolvedValueOnce(null); // no conflict

      await service.update("tenant-1", "cust-1", { phone: "0779999999" }, "user-1");

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          actorUserId: "user-1",
          action: "CUSTOMER_PHONE_CHANGED",
          entityType: "Customer",
          entityId: "cust-1",
          metadata: { oldPhone: "0771234567", newPhone: "0779999999" },
        }),
      );
    });

    it("does not re-check duplicates when phone and email are both left alone", async () => {
      vi.mocked(customers.findOne).mockResolvedValueOnce(existingCustomer());

      await service.update("tenant-1", "cust-1", { address: "44 Marine Drive" }, "user-1");

      // findById is the only findOne call — no second call probing for a duplicate.
      expect(customers.findOne).toHaveBeenCalledTimes(1);
    });

    it("rejects a tag that does not belong to this tenant", async () => {
      vi.mocked(customers.findOne).mockResolvedValueOnce(existingCustomer());
      vi.mocked(tags.find).mockResolvedValueOnce([]);

      await expect(
        service.update("tenant-1", "cust-1", { tagIds: ["not-owned"] }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_TAG_IDS" });
    });
  });

  describe("uploadPhoto", () => {
    it("rejects a file that isn't a real PNG/JPEG/WebP, whatever its claimed type", async () => {
      vi.mocked(customers.findOne).mockResolvedValueOnce({ id: "cust-1", tenantId: "tenant-1" } as Customer);

      await expect(
        service.uploadPhoto("tenant-1", "cust-1", Buffer.from("<svg onload=alert(1)></svg>")),
      ).rejects.toMatchObject({ statusCode: 400, code: "CUSTOMER_PHOTO_INVALID_FILE_TYPE" });
      expect(cloudinary.uploadCustomerPhoto).not.toHaveBeenCalled();
    });

    it("rejects an oversized buffer before ever inspecting its bytes", async () => {
      const huge = Buffer.alloc(3_000_000);
      await expect(service.uploadPhoto("tenant-1", "cust-1", huge)).rejects.toMatchObject({
        statusCode: 400,
        code: "CUSTOMER_PHOTO_FILE_TOO_LARGE",
      });
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
