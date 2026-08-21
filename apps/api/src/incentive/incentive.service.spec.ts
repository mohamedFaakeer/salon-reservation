import type { ObjectLiteral, Repository } from "typeorm";
import { AppointmentStatus, PaymentStatus } from "@salon/shared";
import { IncentiveService } from "./incentive.service";
import type { Appointment } from "../entities/appointment.entity";
import type { AppointmentServiceLine } from "../entities/appointment-service.entity";
import type { IncentivePlan, IncentivePlanServiceRate } from "../entities/incentive-plan.entity";
import type { Payment } from "../entities/payment.entity";
import type { Service } from "../entities/service.entity";
import type { Staff } from "../entities/staff.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    delete: vi.fn(async () => undefined),
  } as unknown as Repository<T>;
}

describe("IncentiveService", () => {
  let plans: Repository<IncentivePlan>;
  let rates: Repository<IncentivePlanServiceRate>;
  let services: Repository<Service>;
  let staff: Repository<Staff>;
  let appointments: Repository<Appointment>;
  let lines: Repository<AppointmentServiceLine>;
  let payments: Repository<Payment>;
  let service: IncentiveService;

  beforeEach(() => {
    plans = mockRepo<IncentivePlan>();
    rates = mockRepo<IncentivePlanServiceRate>();
    services = mockRepo<Service>();
    staff = mockRepo<Staff>();
    appointments = mockRepo<Appointment>();
    lines = mockRepo<AppointmentServiceLine>();
    payments = mockRepo<Payment>();
    service = new IncentiveService(plans, rates, services, staff, appointments, lines, payments);
  });

  describe("create", () => {
    it("rejects a plan with none of the three components set", async () => {
      await expect(service.create("tenant-1", { name: "Empty" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("rejects a monthly target with no bonus rate", async () => {
      await expect(
        service.create("tenant-1", { name: "Half tier", monthlyTargetCents: 100_00 }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a service rate for a service outside the tenant", async () => {
      vi.mocked(services.find).mockResolvedValueOnce([]);

      await expect(
        service.create("tenant-1", {
          name: "Commission",
          baseCommissionPercent: 10,
          serviceRates: [{ serviceId: "svc-foreign", ratePercent: 20 }],
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("accepts a plan with just a base commission and persists it", async () => {
      vi.mocked(plans.findOne).mockResolvedValueOnce({
        id: "generated-id",
        name: "Commission",
        baseCommissionPercent: 10,
        perJobAmountCents: null,
        monthlyTargetCents: null,
        tierBonusPercent: null,
        active: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await service.create("tenant-1", { name: "Commission", baseCommissionPercent: 10 });

      expect(result.name).toBe("Commission");
      expect(result.baseCommissionPercent).toBe(10);
    });
  });

  describe("update", () => {
    it("404s for a plan belonging to another tenant", async () => {
      vi.mocked(plans.findOne).mockResolvedValueOnce(null);

      await expect(
        service.update("tenant-1", "plan-x", { name: "X", baseCommissionPercent: 10 }),
      ).rejects.toMatchObject({ code: "INCENTIVE_PLAN_NOT_FOUND" });
    });
  });

  describe("preview", () => {
    it("returns nothing when no staff has a plan assigned", async () => {
      vi.mocked(staff.find).mockResolvedValueOnce([{ id: "s1", incentivePlan: null } as Staff]);

      const result = await service.preview("tenant-1", { from: "2026-08-01", to: "2026-08-31" });

      expect(result).toEqual([]);
      expect(appointments.find).not.toHaveBeenCalled();
    });

    it("returns a zero row for a staff member with a plan but nothing completed in range", async () => {
      const plan = { id: "plan-1", name: "Commission", baseCommissionPercent: 10 } as IncentivePlan;
      vi.mocked(staff.find).mockResolvedValueOnce([
        { id: "s1", name: "Nadia", incentivePlanId: "plan-1", incentivePlan: plan } as unknown as Staff,
      ]);
      vi.mocked(appointments.find).mockResolvedValueOnce([]);

      const result = await service.preview("tenant-1", { from: "2026-08-01", to: "2026-08-31" });

      expect(result).toEqual([
        {
          staffId: "s1",
          staffName: "Nadia",
          planId: "plan-1",
          planName: "Commission",
          revenueCents: 0,
          commissionCents: 0,
          jobsCompleted: 0,
          perJobCents: 0,
          tierBonusCents: 0,
          totalCents: 0,
        },
      ]);
    });

    it("allocates a partial payment across lines and applies the plan's base commission", async () => {
      const plan = {
        id: "plan-1",
        name: "Commission",
        baseCommissionPercent: 20,
        perJobAmountCents: null,
        monthlyTargetCents: null,
        tierBonusPercent: null,
        serviceRates: [],
      } as unknown as IncentivePlan;
      vi.mocked(staff.find).mockResolvedValueOnce([
        { id: "s1", name: "Nadia", incentivePlanId: "plan-1", incentivePlan: plan } as unknown as Staff,
      ]);
      vi.mocked(appointments.find).mockResolvedValueOnce([
        { id: "appt-1", staffId: "s1", status: AppointmentStatus.COMPLETED } as Appointment,
      ]);
      vi.mocked(lines.find).mockResolvedValueOnce([
        {
          appointmentId: "appt-1",
          serviceId: "svc-cut",
          priceCentsSnapshot: 3_000,
          discountCentsSnapshot: 0,
          status: "ACTIVE",
        } as AppointmentServiceLine,
        {
          appointmentId: "appt-1",
          serviceId: "svc-colour",
          priceCentsSnapshot: 7_000,
          discountCentsSnapshot: 0,
          status: "ACTIVE",
        } as AppointmentServiceLine,
      ]);
      // Only half the bill has been paid so far.
      vi.mocked(payments.find).mockResolvedValueOnce([
        { appointmentId: "appt-1", amountCents: 5_000, state: PaymentStatus.SUCCESS } as Payment,
      ]);

      const result = await service.preview("tenant-1", { from: "2026-08-01", to: "2026-08-31" });

      expect(result).toHaveLength(1);
      // Charged total 10,000; received 5,000 → cut gets 1,500, colour gets 3,500.
      expect(result[0].revenueCents).toBe(5_000);
      // 20% of 5,000 received = 1,000.
      expect(result[0].commissionCents).toBe(1_000);
    });
  });

  describe("ownStaffId", () => {
    it("resolves the staff row linked to this login", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce({ id: "s1" } as Staff);

      await expect(service.ownStaffId("tenant-1", "user-1")).resolves.toBe("s1");
    });

    it("refuses a login with no linked staff record", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(null);

      await expect(service.ownStaffId("tenant-1", "user-1")).rejects.toMatchObject({
        code: "NO_STAFF_RECORD",
      });
    });
  });
});
