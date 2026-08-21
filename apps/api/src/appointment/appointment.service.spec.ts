import type { ObjectLiteral, Repository } from "typeorm";
import { AppointmentStatus, UserRole } from "@salon/shared";
import { AppointmentService } from "./appointment.service";
import type { Appointment } from "../entities/appointment.entity";
import type { AppointmentServiceLine } from "../entities/appointment-service.entity";
import type { Staff } from "../entities/staff.entity";
import type { TenantService } from "../tenant/tenant.service";
import type { BookingService } from "../booking/booking.service";
import type { NotificationService } from "../notification/notification.service";
import type { InvoiceService } from "../invoice/invoice.service";
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
  let lines: Repository<AppointmentServiceLine>;
  let tenantService: TenantService;
  let booking: BookingService;
  let notifications: NotificationService;
  let invoices: InvoiceService;
  let service: AppointmentService;

  beforeEach(() => {
    appointments = mockRepo<Appointment>();
    staff = mockRepo<Staff>();
    lines = mockRepo<AppointmentServiceLine>();
    tenantService = {
      findById: vi.fn(async () => ({ id: "tenant-1", settings: { noShowGraceMinutes: 15 } })),
    } as unknown as TenantService;
    booking = { reserveAndConfirm: vi.fn(async () => ({ id: "appt-1" }) as Appointment) } as unknown as BookingService;
    notifications = { fire: vi.fn(async () => undefined) } as unknown as NotificationService;
    invoices = { issueAndSendQuietly: vi.fn(async () => undefined) } as unknown as InvoiceService;
    service = new AppointmentService(
      appointments,
      staff,
      lines,
      tenantService,
      booking,
      notifications,
      invoices,
    );
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
        { id: "tenant-1", settings: { noShowGraceMinutes: 15 } },
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

    it("allows an elevated role to view any appointment, enriched with service lines", async () => {
      vi.mocked(appointments.findOne).mockResolvedValue({ id: "appt-1", staffId: "staff-1" } as Appointment);
      vi.mocked(lines.find).mockResolvedValue([{ id: "line-1" } as AppointmentServiceLine]);
      const result = await service.findOne("tenant-1", "appt-1", elevatedCtx());
      expect(result.id).toBe("appt-1");
      expect(result.lines).toEqual([{ id: "line-1" }]);
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

    /**
     * The search clause is assembled as SQL text, so these assert on the
     * fragment and parameters handed to the query builder. That is the only
     * seam a unit test has here; the phone reduction itself is the part worth
     * pinning, because it is the bit that silently returns nothing when wrong.
     */
    describe("search", () => {
      function listWith(q: string) {
        const qb = {
          leftJoinAndSelect: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          take: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          getManyAndCount: vi.fn(async () => [[], 0]),
        };
        vi.mocked(
          appointments as unknown as { createQueryBuilder: () => typeof qb },
        ).createQueryBuilder = vi.fn(() => qb) as never;
        return {
          qb,
          run: () => service.list("tenant-1", { q, limit: 50, offset: 0 } as never, elevatedCtx()),
        };
      }

      /** The last andWhere call is the search clause; earlier ones are filters. */
      function searchCall(qb: { andWhere: ReturnType<typeof vi.fn> }) {
        const calls = qb.andWhere.mock.calls;
        return calls[calls.length - 1] as [string, Record<string, string>];
      }

      it("searches the booking reference, both names and the full name", async () => {
        const { qb, run } = listWith("Nimali Perera");
        await run();

        const [sql, params] = searchCall(qb);
        expect(sql).toContain('a."bookingReference" ILIKE :term');
        expect(sql).toContain('customer."firstName" ILIKE :term');
        expect(sql).toContain('customer."lastName" ILIKE :term');
        // Neither name column holds the space, so a full name needs its own clause.
        expect(sql).toContain(`(customer."firstName" || ' ' || customer."lastName") ILIKE :term`);
        expect(params.term).toBe("%Nimali Perera%");
      });

      it("reduces a local number so it matches one stored in international form", async () => {
        const { qb, run } = listWith("077 123 4567");
        await run();

        const [sql, params] = searchCall(qb);
        expect(sql).toContain("LIKE :phone");
        // 0771234567 -> 771234567, which is also what +94771234567 reduces to.
        expect(params.phone).toBe("%771234567%");
      });

      it("reduces an international number to the same thing", async () => {
        const { qb, run } = listWith("+94771234567");
        await run();

        expect(searchCall(qb)[1].phone).toBe("%771234567%");
      });

      it("leaves a bare subscriber number alone", async () => {
        const { qb, run } = listWith("771234567");
        await run();

        expect(searchCall(qb)[1].phone).toBe("%771234567%");
      });

      it("does not add a phone clause for a name", async () => {
        const { qb, run } = listWith("Nimali");
        await run();

        const [sql, params] = searchCall(qb);
        expect(sql).not.toContain("LIKE :phone");
        expect(params.phone).toBeUndefined();
      });

      it("does not add a phone clause for one or two stray digits", async () => {
        // "A2" in a booking reference must not turn into a phone search that
        // matches most of the salon's customers.
        const { qb, run } = listWith("A2");
        await run();

        expect(searchCall(qb)[0]).not.toContain("LIKE :phone");
      });

      it("ignores a whitespace-only search rather than matching everything", async () => {
        const { qb, run } = listWith("   ");
        await run();

        for (const [sql] of qb.andWhere.mock.calls as Array<[string]>) {
          expect(sql).not.toContain(":term");
        }
      });
    });
  });
});
