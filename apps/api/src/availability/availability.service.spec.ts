import type { ObjectLiteral, Repository } from "typeorm";
import { AdvanceRule, type AvailabilityQueryDto } from "@salon/shared";
import { AvailabilityService } from "./availability.service";
import { dayOfWeekOf } from "./time.util";
import type { Staff } from "../entities/staff.entity";
import type { StaffServiceAssignment } from "../entities/staff-service.entity";
import type { Service } from "../entities/service.entity";
import type { WorkingSchedule } from "../entities/working-schedule.entity";
import type { StaffLeave } from "../entities/staff-leave.entity";
import type { Closure } from "../entities/closure.entity";
import type { Appointment } from "../entities/appointment.entity";
import type { SlotHold } from "../entities/slot-hold.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { TenantService } from "../tenant/tenant.service";
import { localMinutesToUtc } from "./time.util";

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

/** A date comfortably within any reasonable booking window, avoiding today's lead-time nuance. */
function inWindowDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

const TEST_DATE = inWindowDate(2);
const TEST_DAY_OF_WEEK = dayOfWeekOf(TEST_DATE);

function fakeTenant(): Tenant {
  return {
    id: "tenant-1",
    slug: "elegance",
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
  } as Tenant;
}

describe("AvailabilityService", () => {
  let staff: Repository<Staff>;
  let assignments: Repository<StaffServiceAssignment>;
  let services: Repository<Service>;
  let schedules: Repository<WorkingSchedule>;
  let leaves: Repository<StaffLeave>;
  let closures: Repository<Closure>;
  let appointments: Repository<Appointment>;
  let slotHolds: Repository<SlotHold>;
  let tenantService: TenantService;
  let service: AvailabilityService;

  beforeEach(() => {
    staff = mockRepo<Staff>();
    assignments = mockRepo<StaffServiceAssignment>();
    services = mockRepo<Service>();
    schedules = mockRepo<WorkingSchedule>();
    leaves = mockRepo<StaffLeave>();
    closures = mockRepo<Closure>();
    appointments = mockRepo<Appointment>();
    slotHolds = mockRepo<SlotHold>();
    tenantService = { findActiveBySlug: vi.fn(async () => fakeTenant()) } as unknown as TenantService;
    service = new AvailabilityService(
      staff,
      assignments,
      services,
      schedules,
      leaves,
      closures,
      appointments,
      slotHolds,
      tenantService,
    );
  });

  function dto(overrides: Partial<AvailabilityQueryDto> = {}): AvailabilityQueryDto {
    return { serviceIds: ["svc-1"], date: TEST_DATE, ...overrides } as AvailabilityQueryDto;
  }

  it("propagates SALON_NOT_FOUND from the tenant lookup", async () => {
    vi.mocked(tenantService.findActiveBySlug).mockRejectedValue(
      Object.assign(new Error("not found"), { code: "SALON_NOT_FOUND" }),
    );
    await expect(service.findSlots("bogus", dto())).rejects.toMatchObject({ code: "SALON_NOT_FOUND" });
  });

  it("throws SERVICE_NOT_FOUND when a requested service id doesn't resolve", async () => {
    vi.mocked(services.find).mockResolvedValue([]);
    await expect(service.findSlots("elegance", dto())).rejects.toMatchObject({
      statusCode: 404,
      code: "SERVICE_NOT_FOUND",
    });
  });

  it("throws STAFF_NOT_FOUND for an unknown explicit staffId", async () => {
    vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", durationMin: 30 } as Service]);
    vi.mocked(staff.findOne).mockResolvedValue(null);
    await expect(service.findSlots("elegance", dto({ staffId: "staff-x" }))).rejects.toMatchObject({
      statusCode: 404,
      code: "STAFF_NOT_FOUND",
    });
  });

  it("returns empty slots when the explicit staffId isn't qualified", async () => {
    vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", durationMin: 30 } as Service]);
    vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1", name: "Staff One" } as Staff);
    vi.mocked(assignments.find).mockResolvedValue([]);

    const result = await service.findSlots("elegance", dto({ staffId: "staff-1" }));
    expect(result).toEqual({ slots: [] });
  });

  it("returns empty slots in ANY mode when no staff is qualified", async () => {
    vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", durationMin: 30 } as Service]);
    vi.mocked(staff.find).mockResolvedValue([{ id: "staff-1", name: "Staff One" } as Staff]);
    vi.mocked(assignments.find).mockResolvedValue([]);

    const result = await service.findSlots("elegance", dto());
    expect(result).toEqual({ slots: [] });
  });

  it("aggregates slots across qualified staff with correct duration", async () => {
    vi.mocked(services.find).mockResolvedValue([
      { id: "svc-1", durationMin: 30 } as Service,
      { id: "svc-2", durationMin: 35 } as Service,
    ]);
    vi.mocked(staff.find).mockResolvedValue([
      { id: "staff-1", name: "Staff One" } as Staff,
      { id: "staff-2", name: "Staff Two" } as Staff,
    ]);
    vi.mocked(assignments.find).mockResolvedValue([
      { staffId: "staff-1", serviceId: "svc-1" } as StaffServiceAssignment,
      { staffId: "staff-1", serviceId: "svc-2" } as StaffServiceAssignment,
      { staffId: "staff-2", serviceId: "svc-1" } as StaffServiceAssignment,
      { staffId: "staff-2", serviceId: "svc-2" } as StaffServiceAssignment,
    ]);
    vi.mocked(schedules.find).mockResolvedValue([
      { staffId: "staff-1", dayOfWeek: TEST_DAY_OF_WEEK, startMin: 540, endMin: 1020, breakStartMin: null, breakEndMin: null } as WorkingSchedule,
      { staffId: "staff-2", dayOfWeek: TEST_DAY_OF_WEEK, startMin: 540, endMin: 1020, breakStartMin: null, breakEndMin: null } as WorkingSchedule,
    ]);

    const result = await service.findSlots("elegance", dto({ serviceIds: ["svc-1", "svc-2"] }));
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(["staff-1", "staff-2"]).toContain(slot.staffId);
      const durationMs = new Date(slot.end).getTime() - new Date(slot.start).getTime();
      expect(durationMs / 60_000).toBe(65);
    }
  });

  it("excludes a staff member on leave for the requested date", async () => {
    vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", durationMin: 30 } as Service]);
    vi.mocked(staff.find).mockResolvedValue([{ id: "staff-1", name: "Staff One" } as Staff]);
    vi.mocked(assignments.find).mockResolvedValue([
      { staffId: "staff-1", serviceId: "svc-1" } as StaffServiceAssignment,
    ]);
    vi.mocked(schedules.find).mockResolvedValue([
      { staffId: "staff-1", dayOfWeek: TEST_DAY_OF_WEEK, startMin: 540, endMin: 1020, breakStartMin: null, breakEndMin: null } as WorkingSchedule,
    ]);
    vi.mocked(leaves.find).mockResolvedValue([
      { staffId: "staff-1", startDate: TEST_DATE, endDate: TEST_DATE } as StaffLeave,
    ]);

    const result = await service.findSlots("elegance", dto());
    expect(result).toEqual({ slots: [] });
  });

  it("returns empty slots when a Closure covers the date", async () => {
    vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", durationMin: 30 } as Service]);
    vi.mocked(staff.find).mockResolvedValue([{ id: "staff-1", name: "Staff One" } as Staff]);
    vi.mocked(assignments.find).mockResolvedValue([
      { staffId: "staff-1", serviceId: "svc-1" } as StaffServiceAssignment,
    ]);
    vi.mocked(schedules.find).mockResolvedValue([
      { staffId: "staff-1", dayOfWeek: TEST_DAY_OF_WEEK, startMin: 540, endMin: 1020, breakStartMin: null, breakEndMin: null } as WorkingSchedule,
    ]);
    vi.mocked(closures.find).mockResolvedValue([
      { startDate: TEST_DATE, endDate: TEST_DATE } as Closure,
    ]);

    const result = await service.findSlots("elegance", dto());
    expect(result).toEqual({ slots: [] });
  });

  it("excludes slots overlapping a real active Appointment or an unexpired HELD SlotHold", async () => {
    vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", durationMin: 30 } as Service]);
    vi.mocked(staff.find).mockResolvedValue([{ id: "staff-1", name: "Staff One" } as Staff]);
    vi.mocked(assignments.find).mockResolvedValue([
      { staffId: "staff-1", serviceId: "svc-1" } as StaffServiceAssignment,
    ]);
    vi.mocked(schedules.find).mockResolvedValue([
      { staffId: "staff-1", dayOfWeek: TEST_DAY_OF_WEEK, startMin: 540, endMin: 660, breakStartMin: null, breakEndMin: null } as WorkingSchedule,
    ]);
    vi.mocked(appointments.find).mockResolvedValue([
      {
        staffId: "staff-1",
        startTime: localMinutesToUtc(TEST_DATE, 540),
        endTime: localMinutesToUtc(TEST_DATE, 600),
      } as Appointment,
    ]);
    vi.mocked(slotHolds.find).mockResolvedValue([
      {
        staffId: "staff-1",
        startTime: localMinutesToUtc(TEST_DATE, 600),
        endTime: localMinutesToUtc(TEST_DATE, 630),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      } as SlotHold,
      {
        // Already expired -> must NOT block (lazily treated as not-busy for reads).
        staffId: "staff-1",
        startTime: localMinutesToUtc(TEST_DATE, 630),
        endTime: localMinutesToUtc(TEST_DATE, 660),
        expiresAt: new Date(Date.now() - 60_000),
      } as SlotHold,
    ]);

    const result = await service.findSlots("elegance", dto());
    const startMinutes = result.slots.map((s) => (new Date(s.start).getTime() - localMinutesToUtc(TEST_DATE, 0).getTime()) / 60_000);
    // [540,600) busy via appointment, [600,630) busy via unexpired hold -> only [630,660) is free.
    expect(startMinutes).toEqual([630]);
  });
});
