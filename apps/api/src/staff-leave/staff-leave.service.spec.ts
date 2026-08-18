import type { ObjectLiteral, Repository } from "typeorm";
import { StaffLeaveService } from "./staff-leave.service";
import type { StaffLeave } from "../entities/staff-leave.entity";
import type { Staff } from "../entities/staff.entity";
import type { Appointment } from "../entities/appointment.entity";
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

describe("StaffLeaveService", () => {
  let leaves: Repository<StaffLeave>;
  let staff: Repository<Staff>;
  let appointments: Repository<Appointment>;
  let audit: AuditService;
  let service: StaffLeaveService;

  beforeEach(() => {
    leaves = mockRepo<StaffLeave>();
    staff = mockRepo<Staff>();
    appointments = mockRepo<Appointment>();
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new StaffLeaveService(leaves, staff, appointments, audit);
  });

  describe("create", () => {
    it("throws STAFF_NOT_FOUND when staff doesn't belong to the tenant", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);

      await expect(
        service.create("tenant-1", "staff-1", { startDate: "2026-09-01", endDate: "2026-09-05" }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 404, code: "STAFF_NOT_FOUND" });
    });

    it("rejects endDate before startDate", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);

      await expect(
        service.create("tenant-1", "staff-1", { startDate: "2026-09-05", endDate: "2026-09-01" }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_DATE_RANGE" });
    });

    it("persists with tenantId/staffId/createdBy and reports no collisions for a clear range", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);

      const result = await service.create(
        "tenant-1",
        "staff-1",
        { startDate: "2026-09-01", endDate: "2026-09-05", reason: "Vacation" },
        "user-1",
      );

      const created = vi.mocked(leaves.create).mock.calls[0][0] as StaffLeave;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.staffId).toBe("staff-1");
      expect(created.createdBy).toBe("user-1");
      expect(result.affectedAppointments).toBe(0);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          actorUserId: "user-1",
          action: "STAFF_LEAVE_CREATED",
          entityType: "StaffLeave",
        }),
      );
    });

    it("allows two overlapping leave ranges for the same staff member", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);

      await service.create(
        "tenant-1",
        "staff-1",
        { startDate: "2026-09-01", endDate: "2026-09-10" },
        "user-1",
      );
      await expect(
        service.create(
          "tenant-1",
          "staff-1",
          { startDate: "2026-09-05", endDate: "2026-09-15" },
          "user-1",
        ),
      ).resolves.toBeDefined();
      expect(leaves.save).toHaveBeenCalledTimes(2);
    });
  });

  describe("affected appointments", () => {
    /**
     * The count exists so an operator learns what booking leave has just
     * stranded. Creating leave deliberately cancels nothing, so getting this
     * wrong means customers are silently left with appointments nobody will
     * keep.
     */
    it("counts and returns the appointments a new leave collides with", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);
      vi.mocked(appointments.find).mockResolvedValue([
        {
          id: "appt-1",
          appointmentDate: "2026-09-02",
          startTime: new Date("2026-09-02T04:30:00Z"),
          bookingReference: "ELE-AAA11",
          customer: { firstName: "Ayesha", lastName: "Perera" },
        },
        {
          id: "appt-2",
          appointmentDate: "2026-09-03",
          startTime: new Date("2026-09-03T03:45:00Z"),
          bookingReference: "ELE-BBB22",
          customer: null,
        },
      ] as unknown as Appointment[]);

      const result = await service.create(
        "tenant-1",
        "staff-1",
        { startDate: "2026-09-02", endDate: "2026-09-03" },
        "user-1",
      );

      expect(result.affectedAppointments).toBe(2);
      expect(result.affected[0]).toMatchObject({
        bookingReference: "ELE-AAA11",
        customerName: "Ayesha Perera",
      });
      // A walk-in with no customer record still counts — it still occupies the day.
      expect(result.affected[1].customerName).toBeNull();
    });

    it("excludes statuses that no longer occupy the day", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);
      vi.mocked(appointments.find).mockResolvedValue([]);

      await service.findAffected("tenant-1", "staff-1", "2026-09-02", "2026-09-03");

      const where = vi.mocked(appointments.find).mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where.tenantId).toBe("tenant-1");
      expect(where.staffId).toBe("staff-1");
      // Cancelled/no-show/rescheduled/expired/completed must not be counted.
      expect(where.status).toBeDefined();
      expect(where.appointmentDate).toBeDefined();
    });
  });

  describe("list", () => {
    it("throws STAFF_NOT_FOUND for a cross-tenant staff id", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);

      await expect(service.list("tenant-B", "staff-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "STAFF_NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    it("throws STAFF_LEAVE_NOT_FOUND when the leave row doesn't belong to this staff/tenant", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);
      vi.mocked(leaves.findOne).mockResolvedValue(null);

      await expect(
        service.remove("tenant-1", "staff-1", "leave-1"),
      ).rejects.toMatchObject({ statusCode: 404, code: "STAFF_LEAVE_NOT_FOUND" });
    });

    it("removes an owned leave row", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-1" } as Staff);
      const row = { id: "leave-1", staffId: "staff-1", tenantId: "tenant-1" } as StaffLeave;
      vi.mocked(leaves.findOne).mockResolvedValue(row);

      await service.remove("tenant-1", "staff-1", "leave-1");

      expect(leaves.remove).toHaveBeenCalledWith(row);
    });
  });
});
