import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import {
  AdvanceRule,
  AppointmentStatus,
  BookingSource,
  SlotHoldStatus,
  type CreateBookingDto,
} from "@salon/shared";
import { BookingService } from "./booking.service";
import { SlotHold, type BookingSnapshot } from "../entities/slot-hold.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Payment } from "../entities/payment.entity";
import { Refund } from "../entities/refund.entity";
import { Staff } from "../entities/staff.entity";
import type { Service } from "../entities/service.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { Customer } from "../entities/customer.entity";
import type { AvailabilityService } from "../availability/availability.service";
import type { CustomerService } from "../customer/customer.service";
import type { AuditService } from "../audit/audit.service";
import { PricingService } from "../pricing/pricing.service";
import { RefundCalculator } from "../pricing/refund-calculator";
import type { PaymentService } from "../payment/payment.service";
import type { NotificationService } from "../notification/notification.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findOneOrFail: vi.fn(async () => ({}) as T),
    update: vi.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<T>;
}

/** A date comfortably inside the default 30-day booking window, not "today". */
function inWindowDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

const BOOKING_START = `${inWindowDate(2)}T04:00:00.000Z`; // ~09:30 Colombo local

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

const QUALIFIED_STAFF_CONTEXT = {
  staffId: "staff-1",
  staffName: "Staff One",
  schedule: { startMin: 0, endMin: 1440 },
  onLeave: false,
  busyIntervals: [],
};

describe("BookingService", () => {
  let servicesRepo: Repository<Service>;
  let slotHoldsRepo: Repository<SlotHold>;
  let appointmentsRepo: Repository<Appointment>;
  let lineRepo: Repository<AppointmentServiceLine>;
  let staffRepo: Repository<Staff>;
  let paymentsRepo: Repository<Payment>;
  let refundsRepo: Repository<Refund>;
  let queryBuilderExecute: ReturnType<typeof vi.fn>;
  let dataSource: DataSource;
  let availability: AvailabilityService;
  let customers: CustomerService;
  let audit: AuditService;
  let payments: PaymentService;
  let notifications: NotificationService;
  let service: BookingService;

  beforeEach(() => {
    servicesRepo = mockRepo<Service>();
    slotHoldsRepo = mockRepo<SlotHold>();
    appointmentsRepo = mockRepo<Appointment>();
    lineRepo = mockRepo<AppointmentServiceLine>();
    paymentsRepo = mockRepo<Payment>();
    refundsRepo = mockRepo<Refund>();
    staffRepo = {
      ...mockRepo<Staff>(),
      findOneOrFail: vi.fn(async () => ({ id: "staff-1", name: "Staff One" }) as Staff),
    } as unknown as Repository<Staff>;

    queryBuilderExecute = vi.fn(async () => ({ affected: 1 }));
    const queryBuilder = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: queryBuilderExecute,
    };

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === SlotHold) return slotHoldsRepo;
        if (entity === Appointment) return appointmentsRepo;
        if (entity === AppointmentServiceLine) return lineRepo;
        if (entity === Staff) return staffRepo;
        if (entity === Payment) return paymentsRepo;
        if (entity === Refund) return refundsRepo;
        throw new Error("unexpected entity in test manager");
      },
      createQueryBuilder: vi.fn(() => queryBuilder),
      query: vi.fn(async () => undefined),
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    availability = {
      loadStaffContext: vi.fn(async () => QUALIFIED_STAFF_CONTEXT),
      isSalonClosed: vi.fn(async () => false),
      isQualified: vi.fn(async () => true),
    } as unknown as AvailabilityService;

    customers = {
      findOrCreateForBooking: vi.fn(async () => ({ id: "customer-1", phone: "+94771234567" }) as Customer),
      create: vi.fn(async () => ({ id: "customer-2", phone: "+94770000000" }) as Customer),
      findById: vi.fn(async () => ({ id: "customer-3", phone: "+94779999999" }) as Customer),
    } as unknown as CustomerService;

    audit = { record: vi.fn() } as unknown as AuditService;
    payments = {
      recordPayment: vi.fn(),
      refundWithManager: vi.fn(async () => ({ id: "refund-1" })),
    } as unknown as PaymentService;
    notifications = { fire: vi.fn(async () => undefined) } as unknown as NotificationService;

    service = new BookingService(
      dataSource,
      servicesRepo,
      slotHoldsRepo,
      appointmentsRepo,
      lineRepo,
      availability,
      customers,
      audit,
      new PricingService(),
      payments,
      new RefundCalculator(),
      notifications,
    );
  });

  function bookingDto(overrides: Partial<CreateBookingDto> = {}): CreateBookingDto {
    return {
      serviceIds: ["svc-1"],
      staffId: "staff-1",
      start: BOOKING_START,
      customer: { firstName: "Amaya", lastName: "Perera", phone: "+94771234567" },
      ...overrides,
    } as CreateBookingDto;
  }

  describe("reserve", () => {
    it("throws SERVICE_NOT_FOUND when a requested service doesn't resolve", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([]);
      await expect(service.reserve(fakeTenant(), bookingDto(), "session-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
      });
    });

    it("returns the existing hold unchanged on a repeated Idempotency-Key", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);
      const snapshot: BookingSnapshot = {
        bookingReference: "ELE-EXIST1",
        customerId: "customer-1",
        notes: null,
        lines: [],
      };
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({
        id: "hold-1",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        bookingSnapshot: snapshot,
      } as unknown as SlotHold);

      const result = await service.reserve(fakeTenant(), bookingDto(), "session-1");

      expect(result).toMatchObject({ holdId: "hold-1", bookingReference: "ELE-EXIST1" });
      expect(availability.loadStaffContext).not.toHaveBeenCalled();
    });

    it("rejects via canBook when the staff isn't qualified", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);
      vi.mocked(availability.isQualified).mockResolvedValue(false);

      await expect(service.reserve(fakeTenant(), bookingDto(), "session-1")).rejects.toMatchObject({
        statusCode: 400,
        code: "STAFF_NOT_QUALIFIED",
      });
    });

    it("creates a HELD hold with a booking snapshot on the happy path", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);

      const result = await service.reserve(fakeTenant(), bookingDto(), "session-1");

      expect(result.amountCents).toBe(5000);
      expect(result.bookingReference).toMatch(/^ELE-[A-Z2-9]{5}$/);
      const created = vi.mocked(slotHoldsRepo.create).mock.calls[0][0] as SlotHold;
      expect(created.status).toBe(SlotHoldStatus.HELD);
      expect(created.sessionKey).toBe("session-1");
      expect((created.bookingSnapshot as BookingSnapshot).customerId).toBe("customer-1");
    });

    it("translates an exclusion-constraint violation into SLOT_UNAVAILABLE", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);
      vi.mocked(slotHoldsRepo.save).mockRejectedValue(Object.assign(new Error("exclusion"), { code: "23P01" }));

      await expect(service.reserve(fakeTenant(), bookingDto(), "session-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "SLOT_UNAVAILABLE",
      });
    });
  });

  describe("confirmHold", () => {
    it("throws HOLD_NOT_FOUND when the hold doesn't exist", async () => {
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue(null);
      await expect(service.confirmHold(fakeTenant(), "hold-1", "session-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "HOLD_NOT_FOUND",
      });
    });

    it("throws HOLD_EXPIRED when the hold is past its expiry", async () => {
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({
        id: "hold-1",
        status: SlotHoldStatus.HELD,
        expiresAt: new Date(Date.now() - 1000),
        bookingSnapshot: { bookingReference: "ELE-X", customerId: "c1", notes: null, lines: [] },
      } as unknown as SlotHold);

      await expect(service.confirmHold(fakeTenant(), "hold-1", "session-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "HOLD_EXPIRED",
      });
    });

    it("returns the existing appointment on an idempotent retry (CONSUMED, same sessionKey)", async () => {
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({
        id: "hold-1",
        status: SlotHoldStatus.CONSUMED,
        sessionKey: "session-1",
        staffId: "staff-1",
        startTime: new Date(BOOKING_START),
      } as unknown as SlotHold);
      const existingAppointment = { id: "appt-1", bookingReference: "ELE-DONE1" } as Appointment;
      vi.mocked(appointmentsRepo.findOne).mockResolvedValue(existingAppointment);

      const result = await service.confirmHold(fakeTenant(), "hold-1", "session-1");
      expect(result.appointment).toMatchObject(existingAppointment);
      expect(result.appointment.staff).toEqual({ id: "staff-1", name: "Staff One" });
    });

    it("throws HOLD_EXPIRED on a CONSUMED hold with a mismatched sessionKey", async () => {
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({
        id: "hold-1",
        status: SlotHoldStatus.CONSUMED,
        sessionKey: "other-session",
      } as unknown as SlotHold);

      await expect(service.confirmHold(fakeTenant(), "hold-1", "session-1")).rejects.toMatchObject({
        statusCode: 409,
        code: "HOLD_EXPIRED",
      });
    });

    it("creates the appointment + service lines and marks the hold CONSUMED", async () => {
      const start = new Date(BOOKING_START);
      const end = new Date(start.getTime() + 30 * 60_000);
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({
        id: "hold-1",
        status: SlotHoldStatus.HELD,
        expiresAt: new Date(Date.now() + 60_000),
        staffId: "staff-1",
        startTime: start,
        endTime: end,
        bookingSnapshot: {
          bookingReference: "ELE-PRE01",
          customerId: "customer-1",
          notes: "Please be gentle",
          lines: [{ serviceId: "svc-1", nameSnapshot: "Cut", durationMinSnapshot: 30, priceCentsSnapshot: 5000 }],
        } satisfies BookingSnapshot,
      } as unknown as SlotHold);

      const { appointment, bookingReference } = await service.confirmHold(fakeTenant(), "hold-1", "session-1");

      expect(bookingReference).toBe("ELE-PRE01");
      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
      expect(appointment.subtotalCents).toBe(5000);
      expect(lineRepo.save).toHaveBeenCalled();
      const savedHold = vi.mocked(slotHoldsRepo.save).mock.calls[0][0] as SlotHold;
      expect(savedHold.status).toBe(SlotHoldStatus.CONSUMED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "APPOINTMENT_CREATED" }),
        expect.anything(),
      );
    });
  });

  describe("cancelHold", () => {
    it("releases a HELD hold", async () => {
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({ id: "hold-1", status: SlotHoldStatus.HELD } as SlotHold);

      await service.cancelHold(fakeTenant(), "hold-1");

      expect(slotHoldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SlotHoldStatus.RELEASED }),
      );
    });

    it("is a no-op for an already-consumed hold", async () => {
      vi.mocked(slotHoldsRepo.findOne).mockResolvedValue({
        id: "hold-1",
        status: SlotHoldStatus.CONSUMED,
      } as SlotHold);

      await service.cancelHold(fakeTenant(), "hold-1");

      expect(slotHoldsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("reserveAndConfirm", () => {
    it("rejects when neither customerId nor newCustomer is provided", async () => {
      await expect(
        service.reserveAndConfirm(
          fakeTenant(),
          { serviceIds: ["svc-1"], staffId: "staff-1", start: BOOKING_START, source: BookingSource.WALK_IN },
          "session-1",
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("creates a CONFIRMED appointment in one transaction, using an existing customerId", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);

      const appointment = await service.reserveAndConfirm(
        fakeTenant(),
        {
          customerId: "customer-3",
          serviceIds: ["svc-1"],
          staffId: "staff-1",
          start: BOOKING_START,
          source: BookingSource.WALK_IN,
        },
        "session-2",
        "user-1",
      );

      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
      expect(appointment.source).toBe(BookingSource.WALK_IN);
      expect(customers.findById).toHaveBeenCalledWith("tenant-1", "customer-3");
      expect(audit.record).toHaveBeenCalled();
    });

    it("checks the appointment straight in when checkInNow is set", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);

      const appointment = await service.reserveAndConfirm(
        fakeTenant(),
        {
          customerId: "customer-3",
          serviceIds: ["svc-1"],
          staffId: "staff-1",
          start: BOOKING_START,
          source: BookingSource.WALK_IN,
          checkInNow: true,
        },
        "session-3",
        "user-1",
      );

      expect(appointment.status).toBe(AppointmentStatus.CHECKED_IN);
      expect(appointment.checkedInAt).toBeInstanceOf(Date);
    });
  });

  function fakeAppointment(overrides: Partial<Appointment> = {}): Appointment {
    return {
      id: "appt-1",
      staffId: "staff-1",
      customerId: "customer-1",
      status: AppointmentStatus.CONFIRMED,
      startTime: new Date(Date.now() + 10 * 60 * 60_000), // 10h from now
      endTime: new Date(Date.now() + 10 * 60 * 60_000 + 30 * 60_000),
      source: BookingSource.WALK_IN,
      notes: null,
      advancePaidCents: 5000,
      totalCents: 10000,
      version: 3,
      ...overrides,
    } as Appointment;
  }

  describe("cancelAppointment", () => {
    it("rejects an already-terminal appointment", async () => {
      const appointment = fakeAppointment({ status: AppointmentStatus.CANCELLED });
      await expect(
        service.cancelAppointment(fakeTenant(), appointment, {
          reason: "test",
          actorUserId: "user-1",
          isSelfService: false,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "APPOINTMENT_NOT_CANCELLABLE" });
    });

    it("rejects self-service cancellation inside the cutoff window", async () => {
      const appointment = fakeAppointment({ startTime: new Date(Date.now() + 30 * 60_000) }); // 30 min out, cutoff is 2h
      await expect(
        service.cancelAppointment(fakeTenant(), appointment, {
          reason: "test",
          actorUserId: null,
          isSelfService: true,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "APPOINTMENT_NOT_CANCELLABLE" });
    });

    it("allows staff-initiated cancel inside what would be the self-service cutoff", async () => {
      const appointment = fakeAppointment({ startTime: new Date(Date.now() + 30 * 60_000) });
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({
        ...appointment,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancelAppointment(fakeTenant(), appointment, {
        reason: "staff cancelled",
        actorUserId: "user-1",
        isSelfService: false,
      });

      expect(result.status).toBe(AppointmentStatus.CANCELLED);
    });

    it("computes and applies a refund before the cutoff, then marks CANCELLED via optimistic lock", async () => {
      const appointment = fakeAppointment({ advancePaidCents: 5000 });
      vi.mocked(paymentsRepo.find).mockResolvedValue([
        { id: "payment-1", amountCents: 5000, state: "SUCCESS", createdAt: new Date() } as Payment,
      ]);
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({
        ...appointment,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancelAppointment(fakeTenant(), appointment, {
        reason: "customer request",
        actorUserId: "user-1",
        isSelfService: false,
      });

      expect(payments.refundWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "payment-1",
        expect.objectContaining({ amountCents: 5000 }),
        "user-1",
      );
      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "APPOINTMENT_CANCELLED",
          metadata: expect.objectContaining({ refundCents: 5000 }),
        }),
        expect.anything(),
      );
    });

    it("applies no refund when cancelling after the cutoff (0% tier), never calling refundWithManager", async () => {
      const appointment = fakeAppointment({ startTime: new Date(Date.now() + 30 * 60_000), advancePaidCents: 5000 });
      vi.mocked(paymentsRepo.find).mockResolvedValue([
        { id: "payment-1", amountCents: 5000, state: "SUCCESS", createdAt: new Date() } as Payment,
      ]);
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({
        ...appointment,
        status: AppointmentStatus.CANCELLED,
      });

      await service.cancelAppointment(fakeTenant(), appointment, {
        reason: "staff cancelled late",
        actorUserId: "user-1",
        isSelfService: false,
      });

      expect(payments.refundWithManager).not.toHaveBeenCalled();
    });

    it("throws VERSION_CONFLICT when the optimistic-lock update affects zero rows", async () => {
      queryBuilderExecute.mockResolvedValue({ affected: 0 });
      const appointment = fakeAppointment();

      await expect(
        service.cancelAppointment(fakeTenant(), appointment, {
          reason: "test",
          actorUserId: "user-1",
          isSelfService: false,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
    });
  });

  describe("rescheduleAppointment", () => {
    it("creates a new appointment, marks the original RESCHEDULED, and re-points payments", async () => {
      const appointment = fakeAppointment({ advancePaidCents: 3000, totalCents: 10000 });
      vi.mocked(lineRepo.find).mockResolvedValue([
        {
          serviceId: "svc-1",
          nameSnapshot: "Cut",
          durationMinSnapshot: 30,
          priceCentsSnapshot: 5000,
          status: "ACTIVE",
        } as AppointmentServiceLine,
      ]);

      const newStart = new Date(Date.now() + 20 * 60 * 60_000).toISOString();
      const result = await service.rescheduleAppointment(fakeTenant(), appointment, {
        newStart,
        actorUserId: "user-1",
        isSelfService: false,
      });

      // The original was marked RESCHEDULED via the optimistic-lock query builder.
      expect(appointmentsRepo.save).toHaveBeenCalled(); // createAppointmentAtomic's insert
      expect(appointmentsRepo.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rescheduledFromId: appointment.id, advancePaidCents: 3000, balanceCents: 7000 }),
      );
      expect(paymentsRepo.update).toHaveBeenCalledWith(
        { appointmentId: appointment.id },
        expect.objectContaining({ appointmentId: expect.any(String) }),
      );
      expect(result).toBeDefined();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "APPOINTMENT_RESCHEDULED" }),
        expect.anything(),
      );
    });

    it("rejects rescheduling an already-terminal appointment", async () => {
      const appointment = fakeAppointment({ status: AppointmentStatus.COMPLETED });
      await expect(
        service.rescheduleAppointment(fakeTenant(), appointment, {
          newStart: new Date(Date.now() + 20 * 60 * 60_000).toISOString(),
          actorUserId: "user-1",
          isSelfService: false,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "APPOINTMENT_NOT_CANCELLABLE" });
    });
  });

  describe("markNoShow", () => {
    it("rejects marking no-show before the grace period has elapsed", async () => {
      const appointment = fakeAppointment({
        status: AppointmentStatus.CONFIRMED,
        startTime: new Date(Date.now() - 5 * 60_000), // started 5 min ago, grace is 15 min
      });
      await expect(service.markNoShow(fakeTenant(), appointment, { actorUserId: "user-1" })).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_STATE",
      });
    });

    it("marks NO_SHOW and applies the no-show refund percent once the grace period has elapsed", async () => {
      const appointment = fakeAppointment({
        status: AppointmentStatus.CONFIRMED,
        startTime: new Date(Date.now() - 30 * 60_000), // started 30 min ago, grace is 15 min
        advancePaidCents: 5000,
      });
      vi.mocked(paymentsRepo.find).mockResolvedValue([
        { id: "payment-1", amountCents: 5000, state: "SUCCESS", createdAt: new Date() } as Payment,
      ]);
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({
        ...appointment,
        status: AppointmentStatus.NO_SHOW,
      });

      const result = await service.markNoShow(fakeTenant(), appointment, { actorUserId: "user-1" });

      expect(result.status).toBe(AppointmentStatus.NO_SHOW);
      // fakeTenant()'s default noShowRefundPercent is 0 — no refund issued.
      expect(payments.refundWithManager).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "APPOINTMENT_NO_SHOW" }),
        expect.anything(),
      );
    });

    it("rejects marking no-show for a status other than CONFIRMED/CHECKED_IN", async () => {
      const appointment = fakeAppointment({ status: AppointmentStatus.COMPLETED });
      await expect(service.markNoShow(fakeTenant(), appointment, { actorUserId: "user-1" })).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_STATE",
      });
    });
  });

  describe("addService", () => {
    it("rejects an already-terminal appointment", async () => {
      const appointment = fakeAppointment({ status: AppointmentStatus.CANCELLED });
      await expect(
        service.addService(fakeTenant(), appointment, { serviceIds: ["svc-2"], actorUserId: "user-1" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "APPOINTMENT_NOT_CANCELLABLE" });
    });

    it("throws SERVICE_NOT_FOUND when a requested service doesn't resolve", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([]);
      const appointment = fakeAppointment({ discountCents: 0 });
      await expect(
        service.addService(fakeTenant(), appointment, { serviceIds: ["svc-2"], actorUserId: "user-1" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_NOT_FOUND" });
    });

    it("appends the new line and recomputes totals via the optimistic-lock update", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-2", name: "Add-on", durationMin: 15, priceCents: 3000 } as Service,
      ]);
      vi.mocked(lineRepo.find).mockResolvedValue([
        { id: "line-1", priceCentsSnapshot: 5000, status: "ACTIVE" } as AppointmentServiceLine,
        { id: "line-2", priceCentsSnapshot: 3000, status: "ACTIVE" } as AppointmentServiceLine,
      ]);
      const appointment = fakeAppointment({ discountCents: 0, advancePaidCents: 5000 });
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({ ...appointment, totalCents: 8000 });

      const result = await service.addService(fakeTenant(), appointment, {
        serviceIds: ["svc-2"],
        actorUserId: "user-1",
      });

      expect(lineRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ serviceId: "svc-2", priceCentsSnapshot: 3000, status: "ACTIVE" }),
      ]);
      expect(queryBuilderExecute).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "APPOINTMENT_SERVICE_ADDED",
          metadata: expect.objectContaining({ serviceIds: ["svc-2"], totalCents: 8000 }),
        }),
        expect.anything(),
      );
      expect(result.totalCents).toBe(8000);
    });
  });

  describe("removeService", () => {
    function twoActiveLines(): AppointmentServiceLine[] {
      return [
        { id: "line-1", priceCentsSnapshot: 5000, status: "ACTIVE" } as AppointmentServiceLine,
        { id: "line-2", priceCentsSnapshot: 3000, status: "ACTIVE" } as AppointmentServiceLine,
      ];
    }

    it("rejects an already-terminal appointment", async () => {
      const appointment = fakeAppointment({ status: AppointmentStatus.CANCELLED });
      await expect(
        service.removeService(fakeTenant(), appointment, { lineId: "line-1", reason: "test", actorUserId: "user-1" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "APPOINTMENT_NOT_CANCELLABLE" });
    });

    it("404s when the line doesn't belong to this appointment", async () => {
      vi.mocked(lineRepo.findOne).mockResolvedValue(null);
      const appointment = fakeAppointment({ discountCents: 0 });
      await expect(
        service.removeService(fakeTenant(), appointment, { lineId: "nope", reason: "test", actorUserId: "user-1" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });

    it("rejects removing the last active service line", async () => {
      const [onlyLine] = twoActiveLines();
      vi.mocked(lineRepo.findOne).mockResolvedValue(onlyLine);
      vi.mocked(lineRepo.find).mockResolvedValue([onlyLine]);
      const appointment = fakeAppointment({ discountCents: 0 });
      await expect(
        service.removeService(fakeTenant(), appointment, {
          lineId: "line-1",
          reason: "test",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "BAD_STATE" });
    });

    it("recomputes totals with no refund when the remaining total still covers what's paid", async () => {
      const lines = twoActiveLines();
      vi.mocked(lineRepo.findOne).mockResolvedValue(lines[1]);
      vi.mocked(lineRepo.find).mockResolvedValue(lines);
      const appointment = fakeAppointment({ discountCents: 0, advancePaidCents: 5000 });
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({ ...appointment, advancePaidCents: 5000 });

      await service.removeService(fakeTenant(), appointment, {
        lineId: "line-2",
        reason: "customer changed mind",
        actorUserId: "user-1",
      });

      expect(payments.refundWithManager).not.toHaveBeenCalled();
      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "line-2", status: "REMOVED", removedReason: "customer changed mind" }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "APPOINTMENT_SERVICE_REMOVED",
          metadata: expect.objectContaining({ lineId: "line-2", refundCents: 0, totalCents: 5000 }),
        }),
        expect.anything(),
      );
    });

    it("refunds the overpayment when removal drops the total below what's already paid", async () => {
      const lines = twoActiveLines();
      vi.mocked(lineRepo.findOne).mockResolvedValue(lines[1]);
      vi.mocked(lineRepo.find).mockResolvedValue(lines);
      const appointment = fakeAppointment({ discountCents: 0, advancePaidCents: 8000 });
      vi.mocked(paymentsRepo.find).mockResolvedValue([
        { id: "payment-1", amountCents: 8000, state: "SUCCESS", createdAt: new Date() } as Payment,
      ]);
      // Post-refund re-fetch: refundWithManager already moved advancePaidCents down by 3000.
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({ ...appointment, advancePaidCents: 5000 });

      await service.removeService(fakeTenant(), appointment, {
        lineId: "line-2",
        reason: "customer changed mind",
        actorUserId: "user-1",
      });

      expect(payments.refundWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "payment-1",
        expect.objectContaining({ amountCents: 3000, reason: "Service removed" }),
        "user-1",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "APPOINTMENT_SERVICE_REMOVED",
          metadata: expect.objectContaining({ refundCents: 3000, totalCents: 5000 }),
        }),
        expect.anything(),
      );
    });

    it("throws VERSION_CONFLICT when the optimistic-lock update affects zero rows", async () => {
      queryBuilderExecute.mockResolvedValue({ affected: 0 });
      const lines = twoActiveLines();
      vi.mocked(lineRepo.findOne).mockResolvedValue(lines[1]);
      vi.mocked(lineRepo.find).mockResolvedValue(lines);
      const appointment = fakeAppointment({ discountCents: 0, advancePaidCents: 0 });
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue({ ...appointment, advancePaidCents: 0 });

      await expect(
        service.removeService(fakeTenant(), appointment, {
          lineId: "line-2",
          reason: "test",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
    });
  });
});
