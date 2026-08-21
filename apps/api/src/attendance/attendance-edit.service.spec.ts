import type { ObjectLiteral, Repository } from "typeorm";
import { AttendanceEditRequestStatus, DEFAULT_TENANT_SETTINGS, UserRole } from "@salon/shared";
import { AttendanceEditService } from "./attendance-edit.service";
import type { AttendanceDay } from "../entities/attendance-day.entity";
import type { AttendanceEditRequest } from "../entities/attendance-edit-request.entity";
import type { Staff } from "../entities/staff.entity";
import type { WorkingSchedule } from "../entities/working-schedule.entity";
import type { TenantContextData } from "../tenant/tenant-context";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
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
  return { id: "staff-1", tenantId: "tenant-1", userId: "user-staff", name: "Nadia", active: true, ...overrides } as Staff;
}

describe("AttendanceEditService", () => {
  let requests: Repository<AttendanceEditRequest>;
  let days: Repository<AttendanceDay>;
  let staff: Repository<Staff>;
  let schedules: Repository<WorkingSchedule>;
  let tenants: { getSettings: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: AttendanceEditService;

  beforeEach(() => {
    requests = mockRepo<AttendanceEditRequest>();
    days = mockRepo<AttendanceDay>();
    staff = mockRepo<Staff>();
    schedules = mockRepo<WorkingSchedule>();
    tenants = { getSettings: vi.fn(async () => ({ ...DEFAULT_TENANT_SETTINGS, currency: "LKR", timezone: "Asia/Colombo" })) };
    audit = { record: vi.fn(async () => undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AttendanceEditService(requests, days, staff, schedules, tenants as any, audit as any);
    vi.mocked(requests.findOne).mockImplementation(async () => ({
      id: "req-1",
      staff: staffRow(),
      requestedByUser: { name: "Nadia" },
      decidedByUser: null,
      status: AttendanceEditRequestStatus.PENDING,
      staffId: "staff-1",
      workDate: "2026-08-20",
      previousCheckInAt: null,
      previousCheckOutAt: null,
      requestedCheckInAt: null,
      requestedCheckOutAt: null,
      attendanceId: null,
      createdAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  });

  describe("request", () => {
    it("rejects a request with neither time filled in", async () => {
      await expect(
        service.request("tenant-1", ctx(), { workDate: "2026-08-20", reason: "forgot" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("requires a check-in when no attendance row exists yet for that day", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      vi.mocked(days.findOne).mockResolvedValueOnce(null);

      await expect(
        service.request("tenant-1", ctx(), {
          workDate: "2026-08-20",
          requestedCheckOutAt: "2026-08-20T11:00:00Z",
          reason: "forgot to check in",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("snapshots the existing row's times as 'previous' at filing time", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());
      vi.mocked(days.findOne).mockResolvedValueOnce({
        id: "day-1",
        checkInAt: new Date("2026-08-20T04:00:00Z"),
        checkOutAt: null,
      } as AttendanceDay);

      await service.request("tenant-1", ctx(), {
        workDate: "2026-08-20",
        requestedCheckOutAt: "2026-08-20T11:00:00Z",
        reason: "forgot to check out",
      });

      const created = vi.mocked(requests.create).mock.calls[0][0] as Partial<AttendanceEditRequest>;
      expect(created.previousCheckInAt).toEqual(new Date("2026-08-20T04:00:00Z"));
      expect(created.attendanceId).toBe("day-1");
    });

    it("blocks a STAFF caller from filing on somebody else's behalf", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(staffRow());

      await expect(
        service.request("tenant-1", ctx(), {
          staffId: "someone-else",
          workDate: "2026-08-20",
          requestedCheckInAt: "2026-08-20T04:00:00Z",
          reason: "x",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("decide", () => {
    it("refuses a caller without an approval permission role", async () => {
      await expect(
        service.decide("tenant-1", ctx({ roles: [UserRole.STAFF] }), "req-1", {
          status: AttendanceEditRequestStatus.APPROVED,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses to re-decide a request that already has a verdict", async () => {
      vi.mocked(requests.findOne).mockResolvedValueOnce({
        id: "req-1",
        status: AttendanceEditRequestStatus.APPROVED,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await expect(
        service.decide("tenant-1", ctx({ roles: [UserRole.MANAGER] }), "req-1", {
          status: AttendanceEditRequestStatus.REJECTED,
        }),
      ).rejects.toMatchObject({ code: "EDIT_REQUEST_ALREADY_DECIDED" });
    });

    it("creates a new attendance day when approving a request that had none", async () => {
      vi.mocked(requests.findOne).mockResolvedValueOnce({
        id: "req-1",
        tenantId: "tenant-1",
        staffId: "staff-1",
        workDate: "2026-08-20",
        status: AttendanceEditRequestStatus.PENDING,
        attendanceId: null,
        requestedCheckInAt: new Date("2026-08-20T04:00:00Z"),
        requestedCheckOutAt: null,
        previousCheckInAt: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(days.save).mockImplementationOnce(async (d) => ({ id: "day-new", ...d }) as AttendanceDay);

      await service.decide("tenant-1", ctx({ roles: [UserRole.MANAGER], userId: "user-mgr" }), "req-1", {
        status: AttendanceEditRequestStatus.APPROVED,
      });

      expect(days.create).toHaveBeenCalledWith(
        expect.objectContaining({ staffId: "staff-1", checkInAt: new Date("2026-08-20T04:00:00Z") }),
      );
      const savedRequest = vi.mocked(requests.save).mock.calls[0][0] as AttendanceEditRequest;
      expect(savedRequest.attendanceId).toBe("day-new");
      expect(savedRequest.decidedBy).toBe("user-mgr");
    });

    it("rejecting a request never touches the attendance row", async () => {
      vi.mocked(requests.findOne).mockResolvedValueOnce({
        id: "req-1",
        status: AttendanceEditRequestStatus.PENDING,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await service.decide("tenant-1", ctx({ roles: [UserRole.OWNER], userId: "user-owner" }), "req-1", {
        status: AttendanceEditRequestStatus.REJECTED,
        note: "already reflected correctly",
      });

      expect(days.save).not.toHaveBeenCalled();
      const savedRequest = vi.mocked(requests.save).mock.calls[0][0] as AttendanceEditRequest;
      expect(savedRequest.status).toBe(AttendanceEditRequestStatus.REJECTED);
      expect(savedRequest.decisionNote).toBe("already reflected correctly");
    });
  });

  describe("withdraw", () => {
    it("lets the requester withdraw their own pending request", async () => {
      vi.mocked(requests.findOne).mockResolvedValueOnce({
        id: "req-1",
        requestedBy: "user-staff",
        status: AttendanceEditRequestStatus.PENDING,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await service.withdraw("tenant-1", ctx({ userId: "user-staff" }), "req-1");

      const saved = vi.mocked(requests.save).mock.calls[0][0] as AttendanceEditRequest;
      expect(saved.status).toBe(AttendanceEditRequestStatus.WITHDRAWN);
    });

    it("blocks withdrawing someone else's request without approval authority", async () => {
      vi.mocked(requests.findOne).mockResolvedValueOnce({
        id: "req-1",
        requestedBy: "user-other",
        status: AttendanceEditRequestStatus.PENDING,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await expect(
        service.withdraw("tenant-1", ctx({ userId: "user-staff" }), "req-1"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
