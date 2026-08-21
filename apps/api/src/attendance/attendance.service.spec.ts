import type { ObjectLiteral, Repository } from "typeorm";
import { DEFAULT_TENANT_SETTINGS, UserRole } from "@salon/shared";
import { AttendanceService } from "./attendance.service";
import type { AttendanceDay } from "../entities/attendance-day.entity";
import type { Closure } from "../entities/closure.entity";
import type { Staff } from "../entities/staff.entity";
import type { StaffLeave } from "../entities/staff-leave.entity";
import type { WorkingSchedule } from "../entities/working-schedule.entity";
import type { TenantContextData } from "../tenant/tenant-context";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    insert: vi.fn(async () => ({})),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    createQueryBuilder: vi.fn(() => queryBuilder([])),
  } as unknown as Repository<T>;
}

function queryBuilder(rows: unknown[]) {
  const qb: Record<string, unknown> = {};
  for (const method of ["leftJoinAndSelect", "where", "andWhere"]) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getMany = vi.fn(async () => rows);
  return qb;
}

function ctx(overrides: Partial<TenantContextData> = {}): TenantContextData {
  return {
    userId: "user-staff",
    email: "a@example.com",
    name: "Nadia",
    tenantId: "tenant-1",
    branchId: null,
    roles: [UserRole.STAFF],
    ...overrides,
  };
}

function staffRow(overrides: Partial<Staff> = {}): Staff {
  return {
    id: "staff-1",
    tenantId: "tenant-1",
    userId: "user-staff",
    name: "Nadia",
    active: true,
    ...overrides,
  } as Staff;
}

describe("AttendanceService", () => {
  let days: Repository<AttendanceDay>;
  let staff: Repository<Staff>;
  let schedules: Repository<WorkingSchedule>;
  let leave: Repository<StaffLeave>;
  let closures: Repository<Closure>;
  let tenants: { getSettings: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: AttendanceService;

  beforeEach(() => {
    days = mockRepo<AttendanceDay>();
    staff = mockRepo<Staff>();
    schedules = mockRepo<WorkingSchedule>();
    leave = mockRepo<StaffLeave>();
    closures = mockRepo<Closure>();
    tenants = { getSettings: vi.fn(async () => ({ ...DEFAULT_TENANT_SETTINGS, currency: "LKR", timezone: "Asia/Colombo" })) };
    audit = { record: vi.fn(async () => undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AttendanceService(days, staff, schedules, leave, closures, tenants as any, audit as any);
  });

  describe("checkIn", () => {
    it("self check-in snapshots the rostered shift and the tenant's grace settings", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      vi.mocked(schedules.findOne).mockResolvedValueOnce({
        startMin: 540,
        endMin: 1080,
      } as WorkingSchedule);

      await service.checkIn("tenant-1", ctx(), undefined);

      const created = vi.mocked(days.create).mock.calls[0][0] as Partial<AttendanceDay>;
      expect(created.expectedStartMin).toBe(540);
      expect(created.expectedEndMin).toBe(1080);
      expect(created.graceMinutes).toBe(DEFAULT_TENANT_SETTINGS.attendanceGraceMinutes);
      expect(created.checkInBy).toBe("user-staff");
    });

    it("does not audit a self check-in — it is already fully attributed by checkInBy", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());

      await service.checkIn("tenant-1", ctx(), undefined);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it("audits a punch made on somebody else's behalf", async () => {
      const front = ctx({ userId: "user-desk", roles: [UserRole.RECEPTIONIST] });
      const target = staffRow({ id: "staff-2", userId: "user-other" });
      // resolveTarget looks up the caller's own staff row first (none here),
      // then the named target.
      vi.mocked(staff.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(target);

      await service.checkIn("tenant-1", front, "staff-2");

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "ATTENDANCE_CHECK_IN", actorUserId: "user-desk" }),
      );
    });

    it("refuses a receptionist naming a staff member as themselves when they hold no staff record", async () => {
      // A receptionist punching *themselves* with no linked staff row is a
      // configuration gap, not a permission question — distinct from the
      // on-behalf path above.
      vi.mocked(staff.findOne).mockResolvedValueOnce(null);

      await expect(service.checkIn("tenant-1", ctx({ roles: [UserRole.RECEPTIONIST] }), undefined)).rejects.toMatchObject({
        code: "NO_STAFF_RECORD",
      });
    });

    it("blocks a STAFF caller from naming anyone but themselves", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());

      await expect(service.checkIn("tenant-1", ctx(), "someone-elses-staff-id")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("turns the unique-index collision into a clear ALREADY_CHECKED_IN error", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      vi.mocked(days.insert).mockRejectedValueOnce(
        Object.assign(new Error("duplicate key"), { code: "23505" }),
      );

      await expect(service.checkIn("tenant-1", ctx(), undefined)).rejects.toMatchObject({
        code: "ALREADY_CHECKED_IN",
      });
    });

    it("refuses to check in an inactive staff member", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow({ active: false }));

      await expect(service.checkIn("tenant-1", ctx(), undefined)).rejects.toMatchObject({
        code: "STAFF_INACTIVE",
      });
    });
  });

  describe("checkOut", () => {
    it("closes the most recently opened shift and computes minutes worked", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      const openRow = {
        id: "day-1",
        workDate: "2026-08-20",
        checkInAt: new Date(Date.now() - 2 * 3_600_000),
        checkOutAt: null,
        expectedEndMin: 1080,
        earlyGraceMinutes: 10,
      } as AttendanceDay;
      vi.mocked(days.findOne).mockResolvedValueOnce(openRow);

      await service.checkOut("tenant-1", ctx(), undefined);

      const saved = vi.mocked(days.save).mock.calls[0][0] as AttendanceDay;
      expect(saved.checkOutAt).toBeInstanceOf(Date);
      expect(saved.workedMinutes).toBeGreaterThan(0);
    });

    it("refuses to check out someone with no open shift, and points at the correction flow", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      vi.mocked(days.findOne).mockResolvedValueOnce(null);

      await expect(service.checkOut("tenant-1", ctx(), undefined)).rejects.toMatchObject({
        code: "NOT_CHECKED_IN",
      });
    });

    it("refuses to silently close a check-in left open for more than the stale-shift limit", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      vi.mocked(days.findOne).mockResolvedValueOnce({
        id: "day-1",
        workDate: "2026-08-01",
        checkInAt: new Date("2026-08-01T03:30:00Z"),
        checkOutAt: null,
      } as AttendanceDay);

      await expect(service.checkOut("tenant-1", ctx(), undefined)).rejects.toMatchObject({
        code: "STALE_CHECK_IN",
      });
      expect(days.save).not.toHaveBeenCalled();
    });
  });

  describe("ownStaffId", () => {
    it("resolves the caller's linked staff row", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow({ id: "staff-9" }));

      await expect(service.ownStaffId("tenant-1", "user-staff")).resolves.toBe("staff-9");
    });

    it("fails clearly when the login has no linked staff row", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(null);

      await expect(service.ownStaffId("tenant-1", "user-staff")).rejects.toMatchObject({
        code: "NO_STAFF_RECORD",
      });
    });
  });
});
