import type { ObjectLiteral, Repository } from "typeorm";
import { ScheduleService } from "./schedule.service";
import type { WorkingSchedule } from "../entities/working-schedule.entity";
import type { Staff } from "../entities/staff.entity";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => []),
    findOne: vi.fn(),
    remove: vi.fn(async (e: T) => e),
  } as unknown as Repository<T>;
  return repo;
}

const actorUserId = "user-1";

describe("ScheduleService", () => {
  let schedules: Repository<WorkingSchedule>;
  let staff: Repository<Staff>;
  let audit: AuditService;
  let service: ScheduleService;

  beforeEach(() => {
    schedules = mockRepo<WorkingSchedule>();
    staff = mockRepo<Staff>();
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new ScheduleService(schedules, staff, audit);
  });

  describe("create", () => {
    it("throws STAFF_NOT_FOUND when staff doesn't belong to the tenant", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);

      await expect(
        service.create(
          "tenant-1",
          { staffId: "staff-1", dayOfWeek: 0, startMin: 540, endMin: 1020 },
          actorUserId,
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "STAFF_NOT_FOUND" });
    });

    it("rejects startMin >= endMin", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);

      await expect(
        service.create(
          "tenant-1",
          { staffId: "staff-1", dayOfWeek: 0, startMin: 1000, endMin: 900 },
          actorUserId,
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_TIME_RANGE" });
    });

    it("rejects a partial break window (only one of breakStartMin/breakEndMin set)", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);

      await expect(
        service.create(
          "tenant-1",
          { staffId: "staff-1", dayOfWeek: 0, startMin: 540, endMin: 1020, breakStartMin: 720 },
          actorUserId,
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_BREAK_WINDOW" });
    });

    it("rejects a break outside the working window", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);

      await expect(
        service.create(
          "tenant-1",
          {
            staffId: "staff-1",
            dayOfWeek: 0,
            startMin: 540,
            endMin: 1020,
            breakStartMin: 1000,
            breakEndMin: 1030,
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_BREAK_WINDOW" });
    });

    it("rejects a duplicate (staffId, dayOfWeek)", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);
      vi.mocked(schedules.findOne).mockResolvedValue({ id: "existing" } as WorkingSchedule);

      await expect(
        service.create(
          "tenant-1",
          { staffId: "staff-1", dayOfWeek: 0, startMin: 540, endMin: 1020 },
          actorUserId,
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: "SCHEDULE_ALREADY_EXISTS" });
    });

    it("persists a valid schedule with a break and audits STAFF_SCHEDULE_CHANGED", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);
      vi.mocked(schedules.findOne).mockResolvedValue(null);

      await service.create(
        "tenant-1",
        {
          staffId: "staff-1",
          dayOfWeek: 0,
          startMin: 540,
          endMin: 1020,
          breakStartMin: 720,
          breakEndMin: 780,
        },
        actorUserId,
      );

      const created = vi.mocked(schedules.create).mock.calls[0][0] as WorkingSchedule;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.breakStartMin).toBe(720);
      expect(created.breakEndMin).toBe(780);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          actorUserId,
          action: "STAFF_SCHEDULE_CHANGED",
          entityType: "WorkingSchedule",
        }),
      );
    });
  });

  describe("update", () => {
    it("throws SCHEDULE_NOT_FOUND for a cross-tenant id", async () => {
      vi.mocked(schedules.findOne).mockResolvedValue(null);

      await expect(
        service.update("tenant-B", "sched-1", { startMin: 600 }, actorUserId),
      ).rejects.toMatchObject({ statusCode: 404, code: "SCHEDULE_NOT_FOUND" });
    });

    it("re-validates the merged window against a partial patch", async () => {
      vi.mocked(schedules.findOne).mockResolvedValue({
        id: "sched-1",
        tenantId: "tenant-1",
        staffId: "staff-1",
        dayOfWeek: 0,
        startMin: 540,
        endMin: 1020,
        breakStartMin: null,
        breakEndMin: null,
      } as WorkingSchedule);

      // endMin patched below the existing startMin -> invalid merged window
      await expect(
        service.update("tenant-1", "sched-1", { endMin: 500 }, actorUserId),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_TIME_RANGE" });
    });

    it("applies a valid partial patch and audits the change", async () => {
      vi.mocked(schedules.findOne).mockResolvedValue({
        id: "sched-1",
        tenantId: "tenant-1",
        staffId: "staff-1",
        dayOfWeek: 0,
        startMin: 540,
        endMin: 1020,
        breakStartMin: null,
        breakEndMin: null,
      } as WorkingSchedule);

      const result = await service.update("tenant-1", "sched-1", { startMin: 600 }, actorUserId);

      expect(result.startMin).toBe(600);
      expect(result.endMin).toBe(1020);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "STAFF_SCHEDULE_CHANGED" }),
      );
    });
  });

  describe("remove", () => {
    it("throws SCHEDULE_NOT_FOUND for a cross-tenant id", async () => {
      vi.mocked(schedules.findOne).mockResolvedValue(null);

      await expect(
        service.remove("tenant-B", "sched-1", actorUserId),
      ).rejects.toMatchObject({ statusCode: 404, code: "SCHEDULE_NOT_FOUND" });
    });

    it("removes an owned row and audits the change", async () => {
      const row = {
        id: "sched-1",
        tenantId: "tenant-1",
        staffId: "staff-1",
        dayOfWeek: 0,
      } as WorkingSchedule;
      vi.mocked(schedules.findOne).mockResolvedValue(row);

      await service.remove("tenant-1", "sched-1", actorUserId);

      expect(schedules.remove).toHaveBeenCalledWith(row);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "STAFF_SCHEDULE_CHANGED" }),
      );
    });
  });
});
