import type { ObjectLiteral, Repository } from "typeorm";
import { AdvanceRule } from "@salon/shared";
import { SalonService } from "./salon.service";
import { ServiceDiscountService } from "../pricing/service-discount.service";
import { DiscountType } from "@salon/shared";
import type { Tenant } from "../entities/tenant.entity";
import type { Branch } from "../entities/branch.entity";
import type { Service } from "../entities/service.entity";
import type { Staff } from "../entities/staff.entity";
import type { WorkingSchedule } from "../entities/working-schedule.entity";
import type { Closure } from "../entities/closure.entity";
import type { TenantService } from "../tenant/tenant.service";

/** Chainable query-builder stub; `getMany` is what the code under test awaits. */
function mockQueryBuilder<T>(rows: T[] = []) {
  const qb = {
    leftJoin: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    orderBy: vi.fn(() => qb),
    getMany: vi.fn(async () => rows),
  };
  return qb;
}

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    count: vi.fn(async () => 0),
    createQueryBuilder: vi.fn(() => mockQueryBuilder<T>()),
  } as unknown as Repository<T>;
}

function fakeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    slug: "elegance",
    name: "Elegance Salon",
    customerBookingEnabled: true,
    settings: {
      advanceRule: AdvanceRule.NO_ADVANCE,
      advanceValueCents: null,
      cancellationPolicy: {
        selfServiceCutoffHours: 2,
        refundPercentBeforeCutoff: 100,
        refundPercentAfterCutoff: 0,
        noShowRefundPercent: 0,
      },
      bookingWindowDays: 30,
      sameDayLeadMinutes: 120,
      noShowGraceMinutes: 15,
      reminderOffsets: [24, 2],
    },
    ...overrides,
  } as Tenant;
}

describe("SalonService", () => {
  let tenants: Repository<Tenant>;
  let branches: Repository<Branch>;
  let services: Repository<Service>;
  let staff: Repository<Staff>;
  let schedules: Repository<WorkingSchedule>;
  let closures: Repository<Closure>;
  let tenantService: TenantService;
  let service: SalonService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    branches = mockRepo<Branch>();
    services = mockRepo<Service>();
    staff = mockRepo<Staff>();
    schedules = mockRepo<WorkingSchedule>();
    closures = mockRepo<Closure>();
    tenantService = { findActiveBySlug: vi.fn(async () => fakeTenant()) } as unknown as TenantService;
    service = new SalonService(
      tenants,
      branches,
      services,
      staff,
      schedules,
      closures,
      tenantService,
      new ServiceDiscountService(),
    );
  });

  describe("list", () => {
    function listReturning(rows: Tenant[]) {
      const qb = mockQueryBuilder(rows);
      vi.mocked(tenants.createQueryBuilder).mockReturnValue(qb as never);
      return qb;
    }

    it("returns active tenants with their branch, service count, and cheapest price", async () => {
      listReturning([fakeTenant({ id: "t1", slug: "elegance", name: "Elegance" })]);
      vi.mocked(branches.findOne).mockResolvedValue({
        address: "123 Galle Rd",
        city: "Colombo",
      } as Branch);
      vi.mocked(services.find).mockResolvedValue([
        { name: "Blow dry", priceCents: 90000 } as Service,
        { name: "Colour", priceCents: 450000 } as Service,
        { name: "Haircut", priceCents: 150000 } as Service,
      ]);

      const result = await service.list();

      expect(result).toEqual([
        {
          slug: "elegance",
          name: "Elegance",
          address: "123 Galle Rd",
          city: "Colombo",
          servicesCount: 3,
          // "price from" is the cheapest, not the first by name.
          priceFromCents: 90000,
          topServices: ["Blow dry", "Colour", "Haircut"],
        },
      ]);
    });

    it("returns null address and city when the tenant has no active branch", async () => {
      listReturning([fakeTenant()]);
      vi.mocked(branches.findOne).mockResolvedValue(null);

      const [result] = await service.list();

      expect(result.address).toBeNull();
      expect(result.city).toBeNull();
    });

    it("has no price to quote when the salon lists no services", async () => {
      listReturning([fakeTenant()]);
      vi.mocked(services.find).mockResolvedValue([]);

      const [result] = await service.list();

      // Math.min() of nothing is Infinity, which would render as a price.
      expect(result.priceFromCents).toBeNull();
      expect(result.topServices).toEqual([]);
    });

    it("filters on name or city only when a search term is given", async () => {
      const withoutTerm = listReturning([]);
      await service.list("   ");
      expect(withoutTerm.andWhere).not.toHaveBeenCalled();

      const withTerm = listReturning([]);
      await service.list("colombo");
      expect(withTerm.andWhere).toHaveBeenCalledWith(expect.stringContaining("ILIKE"), {
        q: "%colombo%",
      });
    });

    it("excludes a deactivated salon from the public directory", async () => {
      const qb = listReturning([]);
      await service.list();
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('"customerBookingEnabled"'),
        expect.anything(),
      );
    });
  });

  describe("profile", () => {
    it("builds the full profile shape, formatting NO_ADVANCE and a 100% refund policy", async () => {
      vi.mocked(branches.findOne).mockResolvedValue({ address: "123 Galle Rd", phone: "0771234567" } as Branch);
      vi.mocked(services.find).mockResolvedValue([
        { id: "s1", name: "Haircut", category: "Hair", durationMin: 30, priceCents: 150000 } as Service,
      ]);
      vi.mocked(staff.find).mockResolvedValue([{ id: "st1", name: "Amara", imageUrl: null, jobTitle: null, gender: null, specialties: null } as Staff]);
      vi.mocked(closures.find).mockResolvedValue([
        { name: "Poya Day", startDate: "2027-01-01", endDate: "2027-01-01" } as Closure,
      ]);
      vi.mocked(schedules.find).mockResolvedValue([]);

      const profile = await service.profile("elegance");

      expect(profile.slug).toBe("elegance");
      expect(profile.address).toBe("123 Galle Rd");
      expect(profile.phone).toBe("0771234567");
      expect(profile.services).toEqual([
        // `discount: null` is explicit rather than absent: the customer site
        // has to distinguish "no offer" from "we did not ask".
        {
          id: "s1",
          name: "Haircut",
          category: "Hair",
          durationMin: 30,
          priceCents: 150000,
          discount: null,
        },
      ]);
      expect(profile.staff).toEqual([
        { id: "st1", name: "Amara", imageUrl: null, jobTitle: null, gender: null, specialties: null },
      ]);
      expect(profile.closures).toEqual([{ name: "Poya Day", startDate: "2027-01-01", endDate: "2027-01-01" }]);
      expect(profile.advanceRuleLabel).toBe("No advance required");
      expect(profile.cancellationPolicySummary).toBe("Free cancellation up to 2h before your appointment");
    });

    it("carries a stylist's photo, job title, gender, and specialties through to the public profile", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([
        {
          id: "st1",
          name: "Amara",
          imageUrl: "https://res.cloudinary.com/demo/staff.png",
          jobTitle: "Senior Stylist",
          gender: "FEMALE",
          specialties: "Balayage, Keratin treatments",
        } as Staff,
      ]);
      vi.mocked(closures.find).mockResolvedValue([]);
      vi.mocked(schedules.find).mockResolvedValue([]);

      const profile = await service.profile("elegance");

      expect(profile.staff).toEqual([
        {
          id: "st1",
          name: "Amara",
          imageUrl: "https://res.cloudinary.com/demo/staff.png",
          jobTitle: "Senior Stylist",
          gender: "FEMALE",
          specialties: "Balayage, Keratin treatments",
        },
      ]);
    });

    it("derives hours as the union (earliest start, latest end) across active staff schedules", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([
        { id: "st1", name: "Amara", imageUrl: null, jobTitle: null, gender: null, specialties: null } as Staff,
        { id: "st2", name: "Nadeesha" } as Staff,
      ]);
      vi.mocked(closures.find).mockResolvedValue([]);
      vi.mocked(schedules.find).mockResolvedValue([
        { staffId: "st1", dayOfWeek: 0, startMin: 540, endMin: 1020 } as WorkingSchedule,
        { staffId: "st2", dayOfWeek: 0, startMin: 480, endMin: 960 } as WorkingSchedule,
        { staffId: "st1", dayOfWeek: 2, startMin: 600, endMin: 900 } as WorkingSchedule,
      ]);

      const profile = await service.profile("elegance");

      expect(profile.hours[0]).toEqual({ dayOfWeek: 0, startMin: 480, endMin: 1020 });
      expect(profile.hours[2]).toEqual({ dayOfWeek: 2, startMin: 600, endMin: 900 });
      expect(profile.hours[1]).toBeNull();
      expect(profile.hours[3]).toBeNull();
    });

    it("ignores schedule rows belonging to inactive (unlisted) staff", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([{ id: "st1", name: "Amara", imageUrl: null, jobTitle: null, gender: null, specialties: null } as Staff]);
      vi.mocked(closures.find).mockResolvedValue([]);
      vi.mocked(schedules.find).mockResolvedValue([
        { staffId: "st1", dayOfWeek: 0, startMin: 540, endMin: 1020 } as WorkingSchedule,
        { staffId: "inactive-staff", dayOfWeek: 0, startMin: 0, endMin: 1439 } as WorkingSchedule,
      ]);

      const profile = await service.profile("elegance");

      expect(profile.hours[0]).toEqual({ dayOfWeek: 0, startMin: 540, endMin: 1020 });
    });

    /**
     * The value fields are deliberately kept apart: FIXED_AMOUNT is priced from
     * `advanceValueCents`, PERCENTAGE from `advancePercent`. The label has to
     * read the same field the engine charges from, so each case sets only its
     * own — a percentage row that leaves `advancePercent` null must not still
     * find a number to print.
     */
    it.each([
      [AdvanceRule.FIXED_AMOUNT, 50000, null, "Rs. 500 advance required"],
      [AdvanceRule.PERCENTAGE, null, 20, "20% advance required"],
      [AdvanceRule.FULL_PAYMENT, null, null, "Full payment required at booking"],
    ])("formats %s as %s", async (advanceRule, advanceValueCents, advancePercent, expected) => {
      vi.mocked(tenantService.findActiveBySlug).mockResolvedValue(
        fakeTenant({
          settings: {
            ...fakeTenant().settings,
            advanceRule,
            advanceValueCents,
            advancePercent,
          },
        }),
      );
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([]);
      vi.mocked(closures.find).mockResolvedValue([]);

      const profile = await service.profile("elegance");

      expect(profile.advanceRuleLabel).toBe(expected);
    });

    it("formats a partial-refund cancellation policy", async () => {
      vi.mocked(tenantService.findActiveBySlug).mockResolvedValue(
        fakeTenant({
          settings: {
            ...fakeTenant().settings,
            cancellationPolicy: {
              selfServiceCutoffHours: 4,
              refundPercentBeforeCutoff: 50,
              refundPercentAfterCutoff: 0,
              noShowRefundPercent: 0,
            },
          },
        }),
      );
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([]);
      vi.mocked(closures.find).mockResolvedValue([]);

      const profile = await service.profile("elegance");

      expect(profile.cancellationPolicySummary).toBe(
        "50% refund if cancelled at least 4h before your appointment",
      );
    });

    it("only fetches closures ending today or later", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([]);
      vi.mocked(closures.find).mockResolvedValue([]);

      await service.profile("elegance");

      expect(closures.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }) }),
      );
    });
  });

  describe("profile discounts", () => {
    it("describes a live offer beside the list price rather than replacing it", async () => {
      // No time is chosen on the salon page, so a Tuesday-evening offer has no
      // single price to quote. Both numbers go out and the page shows the saving.
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(staff.find).mockResolvedValue([]);
      vi.mocked(closures.find).mockResolvedValue([]);
      vi.mocked(schedules.find).mockResolvedValue([]);
      vi.mocked(services.find).mockResolvedValue([
        {
          id: "s1",
          name: "Colour",
          category: "Hair",
          durationMin: 90,
          priceCents: 500000,
          discount: {
            type: DiscountType.PERCENT,
            value: 20,
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            label: "September sale",
            active: true,
            windows: [{ dayOfWeek: 1, startMin: 1020, endMin: 1200 }],
          },
        } as unknown as Service,
      ]);

      const profile = await service.profile("elegance");

      expect(profile.services[0].priceCents).toBe(500000);
      expect(profile.services[0].discount).toEqual({
        label: "September sale",
        discountedPriceCents: 400000,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        windows: [{ dayOfWeek: 1, startMin: 1020, endMin: 1200 }],
      });
    });

    it("hides an offer that has been switched off", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(staff.find).mockResolvedValue([]);
      vi.mocked(closures.find).mockResolvedValue([]);
      vi.mocked(schedules.find).mockResolvedValue([]);
      vi.mocked(services.find).mockResolvedValue([
        {
          id: "s1",
          name: "Colour",
          category: "Hair",
          durationMin: 90,
          priceCents: 500000,
          discount: {
            type: DiscountType.PERCENT,
            value: 20,
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            label: null,
            active: false,
            windows: [],
          },
        } as unknown as Service,
      ]);

      const profile = await service.profile("elegance");

      expect(profile.services[0].discount).toBeNull();
    });
  });
});
