import type { ObjectLiteral, Repository } from "typeorm";
import { AppointmentStatus, UserRole } from "@salon/shared";
import { AppointmentService } from "./appointment.service";
import type { Appointment } from "../entities/appointment.entity";
import type { Staff } from "../entities/staff.entity";
import type { TenantService } from "../tenant/tenant.service";
import type { BookingService } from "../booking/booking.service";
import type { TenantContextData } from "../tenant/tenant-context";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function elevatedCtx(): TenantContextData {
  return { userId: "user-owner", email: "o@x.com", name: "Owner", tenantId: "tenant-1", branchId: null, roles: [UserRole.OWNER] };
}

function staffCtx(userId = "user-staff"): TenantContextData {
  return { userId, email: "s@x.com", name: "Staff", tenantId: "tenant-1", branchId: null, roles: [UserRole.STAFF] };
}

describe("AppointmentService", () => {
  let appointments: Repository<Appointment>;
  let staff: Repository<Staff>;
  let tenantService: TenantService;
  let booking: BookingService;
  let service: AppointmentService;

  beforeEach(() => {
    appointments = mockRepo<Appointment>();
    staff = mockRepo<Staff>();
    tenantService = { findById: vi.fn(async () => ({ id: "tenant-1" })) } as unknown as TenantService;
    booking = { reserveAndConfirm: vi.fn(async () => ({ id: "appt-1" }) as Appointment) } as unknown as BookingService;
    service = new AppointmentService(appointments, staff, tenantService, booking);
  });

  describe("create", () => {
    it("delegates to BookingService.reserveAndConfirm with the resolved tenant", async () => {
      await service.create(
        "tenant-1",
        {
          customerId: "cust-1",
          serviceIds: ["svc-1"],
          staffId: "staff-1",
          start: "2026-01-01T04:00:00.000Z",
          source: "WALK_IN",
        } as never,
        "user-1",
        "session-1",
      );

      expect(booking.reserveAndConfirm).toHaveBeenCalledWith(
        { id: "tenant-1" },
        expect.objectContaining({ customerId: "cust-1", staffId: "staff-1" }),
        "session-1",
        "user-1",
      );
    });
  });

  describe("findOne", () => {
    it("throws NOT_FOUND for a cross-tenant id", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue(null);
      await expect(service.findOne("tenant-1", "appt-1", elevatedCtx())).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("allows an elevated role to view any appointment", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({ id: "appt-1", staffId: "staff-1" } as Appointment);
      const result = await service.findOne("tenant-1", "appt-1", elevatedCtx());
      expect(result.id).toBe("appt-1");
    });

    it("S6: forbids STAFF from viewing another staff member's appointment", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({ id: "appt-1", staffId: "staff-other" } as Appointment);
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-mine" } as Staff);

      await expect(service.findOne("tenant-1", "appt-1", staffCtx())).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("S6: allows STAFF to view their own appointment", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({ id: "appt-1", staffId: "staff-mine" } as Appointment);
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-mine" } as Staff);

      const result = await service.findOne("tenant-1", "appt-1", staffCtx());
      expect(result.id).toBe("appt-1");
    });
  });

  describe("checkIn", () => {
    it("rejects checking in an appointment that isn't CONFIRMED", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        status: AppointmentStatus.CHECKED_IN,
      } as Appointment);

      await expect(service.checkIn("tenant-1", "appt-1")).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_STATE",
      });
    });

    it("checks in a CONFIRMED appointment and computes lateMinutes", async () => {
      const startTime = new Date(Date.now() - 20 * 60_000); // started 20 minutes ago
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        status: AppointmentStatus.CONFIRMED,
        startTime,
      } as Appointment);

      const result = await service.checkIn("tenant-1", "appt-1");

      expect(result.status).toBe(AppointmentStatus.CHECKED_IN);
      expect(result.checkedInAt).toBeInstanceOf(Date);
      expect(result.lateMinutes).toBeGreaterThanOrEqual(19);
    });
  });

  describe("inService / complete", () => {
    it("rejects starting service on an appointment that isn't CHECKED_IN", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        staffId: "staff-mine",
        status: AppointmentStatus.CONFIRMED,
      } as Appointment);

      await expect(service.inService("tenant-1", "appt-1", elevatedCtx())).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_STATE",
      });
    });

    it("S6: forbids STAFF from starting service on another staff member's appointment", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        staffId: "staff-other",
        status: AppointmentStatus.CHECKED_IN,
      } as Appointment);
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-mine" } as Staff);

      await expect(service.inService("tenant-1", "appt-1", staffCtx())).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("completes an IN_SERVICE appointment", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        staffId: "staff-mine",
        status: AppointmentStatus.IN_SERVICE,
      } as Appointment);
      vi.mocked(staff.findOne).mockResolvedValue({ id: "staff-mine" } as Staff);

      const result = await service.complete("tenant-1", "appt-1", staffCtx());
      expect(result.status).toBe(AppointmentStatus.COMPLETED);
      expect(result.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("list", () => {
    it("forces an empty-matching staffId filter for a STAFF caller with no linked Staff row", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);
      const qb = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn(async () => [[], 0]),
      };
      vi.mocked(appointments as unknown as { createQueryBuilder: () => typeof qb }).createQueryBuilder = vi.fn(
        () => qb,
      ) as never;

      await service.list("tenant-1", { limit: 50, offset: 0 } as never, staffCtx());

      expect(qb.andWhere).toHaveBeenCalledWith(
        "a.staffId = :staffId",
        expect.objectContaining({ staffId: expect.any(String) }),
      );
    });
  });
});
