import type { ObjectLiteral, Repository } from "typeorm";
import { BookingSource } from "@salon/shared";
import { StaffNotificationService } from "./staff-notification.service";
import type { StaffNotification } from "../entities/staff-notification.entity";
import type { StaffNotificationRead } from "../entities/staff-notification-read.entity";
import type { Appointment } from "../entities/appointment.entity";

function mockRepo<T extends ObjectLiteral>() {
  const queryBuilder = {
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn(async () => []),
  };
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[], 0] as [T[], number]),
    count: vi.fn(async () => 0),
    createQueryBuilder: vi.fn(() => queryBuilder),
  } as unknown as Repository<T> & { __queryBuilder: typeof queryBuilder };
  (repo as unknown as { __queryBuilder: typeof queryBuilder }).__queryBuilder = queryBuilder;
  return repo;
}

describe("StaffNotificationService", () => {
  let notifications: Repository<StaffNotification> & {
    __queryBuilder: { getMany: ReturnType<typeof vi.fn> };
  };
  let reads: Repository<StaffNotificationRead>;
  let appointments: Repository<Appointment>;
  let service: StaffNotificationService;

  beforeEach(() => {
    notifications = mockRepo<StaffNotification>();
    reads = mockRepo<StaffNotificationRead>();
    appointments = mockRepo<Appointment>();
    service = new StaffNotificationService(notifications, reads, appointments);
  });

  describe("notify", () => {
    it("renders plain-language copy and persists it against the tenant and appointment", async () => {
      await service.notify("tenant-1", "appt-1", {
        type: "APPOINTMENT_CREATED_ONLINE",
        customerName: "Amaya Perera",
        staffName: "Nadeesha",
        startTime: new Date("2026-09-01T04:30:00.000Z"), // ~10:00 Colombo
      });

      expect(notifications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          appointmentId: "appt-1",
          type: "APPOINTMENT_CREATED_ONLINE",
          title: "New online booking",
          body: expect.stringContaining("Amaya Perera"),
        }),
      );
    });

    it("accepts a null appointmentId without erroring", async () => {
      await service.notify("tenant-1", null, {
        type: "APPOINTMENT_CANCELLED_SELF",
        customerName: "Kasun Silva",
        staffName: "Ishara",
        startTime: new Date("2026-09-01T04:30:00.000Z"),
      });

      expect(notifications.save).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: null }));
    });
  });

  describe("unreadStatus", () => {
    it("counts only unread rows for this user and surfaces the most recent as `latest`", async () => {
      const rows = [
        { id: "n-2", title: "Second", body: "b2", createdAt: new Date(), type: "APPOINTMENT_CANCELLED_SELF", appointmentId: null },
        { id: "n-1", title: "First", body: "b1", createdAt: new Date(), type: "APPOINTMENT_CREATED_ONLINE", appointmentId: null },
      ] as StaffNotification[];
      notifications.__queryBuilder.getMany.mockResolvedValue(rows);
      vi.mocked(appointments.count).mockResolvedValue(1);

      const status = await service.unreadStatus("tenant-1", "user-1");

      expect(status.count).toBe(2);
      expect(status.latest).toMatchObject({ id: "n-2", read: false });
    });

    it("shows the popup while a tenant's online-booking count is under the threshold", async () => {
      vi.mocked(appointments.count).mockResolvedValue(9);
      const status = await service.unreadStatus("tenant-1", "user-1");
      expect(status.showPopup).toBe(true);
      expect(appointments.count).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", source: BookingSource.ONLINE },
      });
    });

    it("stops showing the popup once a tenant reaches the lifetime booking threshold", async () => {
      vi.mocked(appointments.count).mockResolvedValue(10);
      const status = await service.unreadStatus("tenant-1", "user-1");
      expect(status.showPopup).toBe(false);
    });

    it("returns null `latest` and zero count when nothing is unread", async () => {
      notifications.__queryBuilder.getMany.mockResolvedValue([]);
      const status = await service.unreadStatus("tenant-1", "user-1");
      expect(status.count).toBe(0);
      expect(status.latest).toBeNull();
    });
  });

  describe("list", () => {
    it("marks rows this user has read and leaves the rest unread", async () => {
      const rows = [
        { id: "n-1", title: "A", body: "a", createdAt: new Date(), type: "APPOINTMENT_CREATED_ONLINE", appointmentId: null },
        { id: "n-2", title: "B", body: "b", createdAt: new Date(), type: "APPOINTMENT_CANCELLED_SELF", appointmentId: null },
      ] as StaffNotification[];
      vi.mocked(notifications.findAndCount).mockResolvedValue([rows, 2]);
      vi.mocked(reads.find).mockResolvedValue([{ notificationId: "n-1", userId: "user-1", readAt: new Date() } as StaffNotificationRead]);

      const result = await service.list("tenant-1", "user-1", { limit: 20, offset: 0 });

      expect(result.data).toEqual([
        expect.objectContaining({ id: "n-1", read: true }),
        expect.objectContaining({ id: "n-2", read: false }),
      ]);
      expect(result.meta).toEqual({ total: 2, limit: 20, offset: 0 });
    });

    it("skips the read-state lookup entirely when there are no notifications", async () => {
      vi.mocked(notifications.findAndCount).mockResolvedValue([[], 0]);
      const result = await service.list("tenant-1", "user-1", { limit: 20, offset: 0 });
      expect(result.data).toEqual([]);
      expect(reads.find).not.toHaveBeenCalled();
    });
  });

  describe("markRead", () => {
    it("throws NOT_FOUND for a notification outside this tenant", async () => {
      vi.mocked(notifications.findOne).mockResolvedValue(null);
      await expect(service.markRead("tenant-1", "user-1", "n-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("inserts a read row on first read", async () => {
      vi.mocked(notifications.findOne).mockResolvedValue({ id: "n-1" } as StaffNotification);
      vi.mocked(reads.findOne).mockResolvedValue(null);

      await service.markRead("tenant-1", "user-1", "n-1");

      expect(reads.save).toHaveBeenCalledWith(
        expect.objectContaining({ notificationId: "n-1", userId: "user-1" }),
      );
    });

    it("is idempotent — does nothing when already marked read", async () => {
      vi.mocked(notifications.findOne).mockResolvedValue({ id: "n-1" } as StaffNotification);
      vi.mocked(reads.findOne).mockResolvedValue({ notificationId: "n-1", userId: "user-1", readAt: new Date() } as StaffNotificationRead);

      await service.markRead("tenant-1", "user-1", "n-1");

      expect(reads.save).not.toHaveBeenCalled();
    });
  });

  describe("markAllRead", () => {
    it("inserts read rows only for the notifications not already read", async () => {
      vi.mocked(notifications.find).mockResolvedValue([{ id: "n-1" }, { id: "n-2" }] as StaffNotification[]);
      vi.mocked(reads.find).mockResolvedValue([{ notificationId: "n-1", userId: "user-1", readAt: new Date() } as StaffNotificationRead]);

      await service.markAllRead("tenant-1", "user-1");

      expect(reads.save).toHaveBeenCalledWith([expect.objectContaining({ notificationId: "n-2", userId: "user-1" })]);
    });

    it("does nothing when there are no notifications for the tenant", async () => {
      vi.mocked(notifications.find).mockResolvedValue([]);
      await service.markAllRead("tenant-1", "user-1");
      expect(reads.find).not.toHaveBeenCalled();
      expect(reads.save).not.toHaveBeenCalled();
    });

    it("does nothing when every notification is already read", async () => {
      vi.mocked(notifications.find).mockResolvedValue([{ id: "n-1" }] as StaffNotification[]);
      vi.mocked(reads.find).mockResolvedValue([{ notificationId: "n-1", userId: "user-1", readAt: new Date() } as StaffNotificationRead]);

      await service.markAllRead("tenant-1", "user-1");

      expect(reads.save).not.toHaveBeenCalled();
    });
  });
});
