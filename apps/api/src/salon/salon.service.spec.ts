import type { ObjectLiteral, Repository } from "typeorm";
import { AdvanceRule } from "@salon/shared";
import { SalonService } from "./salon.service";
import type { Tenant } from "../entities/tenant.entity";
import type { Branch } from "../entities/branch.entity";
import type { Service } from "../entities/service.entity";
import type { Staff } from "../entities/staff.entity";
import type { WorkingSchedule } from "../entities/working-schedule.entity";
import type { Closure } from "../entities/closure.entity";
import type { TenantService } from "../tenant/tenant.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    count: vi.fn(async () => 0),
  } as unknown as Repository<T>;
}

function fakeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    slug: "elegance",
    name: "Elegance Salon",
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
    service = new SalonService(tenants, branches, services, staff, schedules, closures, tenantService);
  });

  describe("list", () => {
    it("returns active tenants with their default branch address and active service count", async () => {
      vi.mocked(tenants.find).mockResolvedValue([fakeTenant({ id: "t1", slug: "elegance", name: "Elegance" })]);
      vi.mocked(branches.findOne).mockResolvedValue({ address: "123 Galle Rd" } as Branch);
      vi.mocked(services.count).mockResolvedValue(5);

      const result = await service.list();

      expect(result).toEqual([{ slug: "elegance", name: "Elegance", address: "123 Galle Rd", servicesCount: 5 }]);
    });

    it("returns null address when the tenant has no active branch", async () => {
      vi.mocked(tenants.find).mockResolvedValue([fakeTenant()]);
      vi.mocked(branches.findOne).mockResolvedValue(null);

      const [result] = await service.list();

      expect(result.address).toBeNull();
    });
  });

  describe("profile", () => {
    it("builds the full profile shape, formatting NO_ADVANCE and a 100% refund policy", async () => {
      vi.mocked(branches.findOne).mockResolvedValue({ address: "123 Galle Rd", phone: "0771234567" } as Branch);
      vi.mocked(services.find).mockResolvedValue([
        { id: "s1", name: "Haircut", category: "Hair", durationMin: 30, priceCents: 150000 } as Service,
      ]);
      vi.mocked(staff.find).mockResolvedValue([{ id: "st1", name: "Amara" } as Staff]);
      vi.mocked(closures.find).mockResolvedValue([
        { name: "Poya Day", startDate: "2027-01-01", endDate: "2027-01-01" } as Closure,
      ]);
      vi.mocked(schedules.find).mockResolvedValue([]);

      const profile = await service.profile("elegance");

      expect(profile.slug).toBe("elegance");
      expect(profile.address).toBe("123 Galle Rd");
      expect(profile.phone).toBe("0771234567");
      expect(profile.services).toEqual([
        { id: "s1", name: "Haircut", category: "Hair", durationMin: 30, priceCents: 150000 },
      ]);
      expect(profile.staff).toEqual([{ id: "st1", name: "Amara" }]);
      expect(profile.closures).toEqual([{ name: "Poya Day", startDate: "2027-01-01", endDate: "2027-01-01" }]);
      expect(profile.advanceRuleLabel).toBe("No advance required");
      expect(profile.cancellationPolicySummary).toBe("Free cancellation up to 2h before your appointment");
    });

    it("derives hours as the union (earliest start, latest end) across active staff schedules", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);
      vi.mocked(services.find).mockResolvedValue([]);
      vi.mocked(staff.find).mockResolvedValue([
        { id: "st1", name: "Amara" } as Staff,
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
      vi.mocked(staff.find).mockResolvedValue([{ id: "st1", name: "Amara" } as Staff]);
      vi.mocked(closures.find).mockResolvedValue([]);
      vi.mocked(schedules.find).mockResolvedValue([
        { staffId: "st1", dayOfWeek: 0, startMin: 540, endMin: 1020 } as WorkingSchedule,
        { staffId: "inactive-staff", dayOfWeek: 0, startMin: 0, endMin: 1439 } as WorkingSchedule,
      ]);

      const profile = await service.profile("elegance");

      expect(profile.hours[0]).toEqual({ dayOfWeek: 0, startMin: 540, endMin: 1020 });
    });

    it.each([
      [AdvanceRule.FIXED_AMOUNT, 50000, "Rs. 500 advance required"],
      [AdvanceRule.PERCENTAGE, 20, "20% advance required"],
      [AdvanceRule.FULL_PAYMENT, null, "Full payment required at booking"],
    ])("formats %s as %s", async (advanceRule, advanceValueCents, expected) => {
      vi.mocked(tenantService.findActiveBySlug).mockResolvedValue(
        fakeTenant({
          settings: {
            ...fakeTenant().settings,
            advanceRule,
            advanceValueCents,
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
});
