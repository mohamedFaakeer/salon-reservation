import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import {
  AdvanceRule,
  DiscountType,
  AppointmentStatus,
  BookingSource,
  SlotHoldStatus,
  DEFAULT_TENANT_ENTITLEMENTS,
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
import { ServiceDiscountService } from "../pricing/service-discount.service";
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
    count: vi.fn(async () => 0),
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
    entitlements: DEFAULT_TENANT_ENTITLEMENTS,
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
      discountCapPercent: 10,
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
  let setSpy: ReturnType<typeof vi.fn>;
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
    setSpy = vi.fn().mockReturnThis();
    const queryBuilder = {
      update: vi.fn().mockReturnThis(),
      set: setSpy,
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
      new ServiceDiscountService(),
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
          lines: [
            {
              serviceId: "svc-1",
              nameSnapshot: "Cut",
              durationMinSnapshot: 30,
              priceCentsSnapshot: 5000,
              discountCentsSnapshot: 0,
              discountLabelSnapshot: null,
            },
          ],
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

    it("allows a booking right up to the plan's daily limit plus its grace buffer", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);
      // Limit 5 + grace 2 = 7 allowed; 6 already on the books is still inside that.
      vi.mocked(appointmentsRepo.count).mockResolvedValue(6);
      const liteTenant = {
        ...fakeTenant(),
        entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: { maxBookingsPerDay: 5 } },
      } as Tenant;

      const appointment = await service.reserveAndConfirm(
        liteTenant,
        { customerId: "customer-3", serviceIds: ["svc-1"], staffId: "staff-1", start: BOOKING_START, source: BookingSource.WALK_IN },
        "session-4",
        "user-1",
      );

      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it("refuses a booking once the plan's daily limit and its grace buffer are both used up", async () => {
      vi.mocked(servicesRepo.find).mockResolvedValue([
        { id: "svc-1", name: "Cut", durationMin: 30, priceCents: 5000 } as Service,
      ]);
      // Limit 5 + grace 2 = 7 allowed; 7 already on the books means the next one is refused.
      vi.mocked(appointmentsRepo.count).mockResolvedValue(7);
      const liteTenant = {
        ...fakeTenant(),
        entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: { maxBookingsPerDay: 5 } },
      } as Tenant;

      await expect(
        service.reserveAndConfirm(
          liteTenant,
          { customerId: "customer-3", serviceIds: ["svc-1"], staffId: "staff-1", start: BOOKING_START, source: BookingSource.WALK_IN },
          "session-5",
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: "DAILY_BOOKING_LIMIT_REACHED" });
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

  /** What the optimistic-lock UPDATE was asked to set. */
  function queryBuilderSet(): Record<string, unknown> {
    const calls = vi.mocked(setSpy).mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
  }

  /**
   * The desk discount. These tests are about the two things that lose money
   * when wrong: the cap, and never letting a bill fall below what has been
   * paid.
   */
  describe("setBillDiscount", () => {
    const APPOINTMENT_ID = "appt-1";

    function bill(overrides: Partial<Appointment> = {}): Appointment {
      return {
        id: APPOINTMENT_ID,
        tenantId: "tenant-1",
        status: AppointmentStatus.CHECKED_IN,
        subtotalCents: 500_000,
        discountCents: 0,
        billDiscountType: null,
        billDiscountValue: null,
        billDiscountCents: 0,
        billDiscountReason: null,
        totalCents: 500_000,
        advancePaidCents: 0,
        balanceCents: 500_000,
        version: 1,
        ...overrides,
      } as Appointment;
    }

    function lines(priceCents: number, discountCents = 0) {
      vi.mocked(lineRepo.find).mockResolvedValue([
        { id: "l1", priceCentsSnapshot: priceCents, discountCentsSnapshot: discountCents, status: "ACTIVE" },
      ] as unknown as AppointmentServiceLine[]);
    }

    function capTenant(percent: number): Tenant {
      const t = fakeTenant();
      return { ...t, settings: { ...t.settings, discountCapPercent: percent } } as Tenant;
    }

    beforeEach(() => {
      lines(500_000);
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue(bill());
    });

    it("applies a discount inside the cap", async () => {
      await service.setBillDiscount(capTenant(10), bill(), {
        type: DiscountType.PERCENT,
        value: 10,
        actorUserId: "user-1",
        mayExceedCap: false,
      });

      const patch = queryBuilderSet();
      expect(patch.billDiscountCents).toBe(50_000);
      expect(patch.totalCents).toBe(450_000);
      expect(patch.discountCents).toBe(50_000);
    });

    it("refuses a discount over the cap for somebody who cannot lift it", async () => {
      await expect(
        service.setBillDiscount(capTenant(10), bill(), {
          type: DiscountType.PERCENT,
          value: 25,
          actorUserId: "user-1",
          mayExceedCap: false,
        }),
      ).rejects.toMatchObject({ statusCode: 403, code: "DISCOUNT_CAP_EXCEEDED" });
    });

    it("allows the same discount for somebody who can", async () => {
      await expect(
        service.setBillDiscount(capTenant(10), bill(), {
          type: DiscountType.PERCENT,
          value: 25,
          actorUserId: "owner-1",
          mayExceedCap: true,
        }),
      ).resolves.toBeDefined();
    });

    it("catches a fixed amount that is over the cap once measured", async () => {
      // LKR 500 off an LKR 800 bill is 63% given away, however it was typed.
      lines(80_000);
      await expect(
        service.setBillDiscount(capTenant(10), bill({ subtotalCents: 80_000, totalCents: 80_000 }), {
          type: DiscountType.FIXED,
          value: 50_000,
          actorUserId: "user-1",
          mayExceedCap: false,
        }),
      ).rejects.toMatchObject({ code: "DISCOUNT_CAP_EXCEEDED" });
    });

    it("measures the cap against what was owed after the salon's own offer", async () => {
      // A 20% promotion has not spent the receptionist's discretion: 10% of
      // the remaining 4,000 is still 10%.
      lines(500_000, 100_000);
      await expect(
        service.setBillDiscount(capTenant(10), bill(), {
          type: DiscountType.PERCENT,
          value: 10,
          actorUserId: "user-1",
          mayExceedCap: false,
        }),
      ).resolves.toBeDefined();
    });

    it("stacks on the service offer rather than replacing it", async () => {
      lines(500_000, 100_000);

      await service.setBillDiscount(capTenant(100), bill(), {
        type: DiscountType.PERCENT,
        value: 10,
        actorUserId: "user-1",
        mayExceedCap: true,
      });

      const patch = queryBuilderSet();
      // 10% of the remaining 4,000 = 400. Total off = 1,400; charged = 3,600.
      expect(patch.billDiscountCents).toBe(40_000);
      expect(patch.discountCents).toBe(140_000);
      expect(patch.totalCents).toBe(360_000);
    });

    it("refuses to discount below what has already been paid", async () => {
      // Turning a discount into a refund silently would invent money movement
      // the refund flow exists to record properly.
      const paid = bill({ advancePaidCents: 480_000 });
      vi.mocked(appointmentsRepo.findOneOrFail).mockResolvedValue(paid);

      await expect(
        service.setBillDiscount(capTenant(100), paid, {
          type: DiscountType.PERCENT,
          value: 50,
          actorUserId: "owner-1",
          mayExceedCap: true,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "DISCOUNT_BELOW_PAID" });
    });

    it("clears the discount when the value is zero", async () => {
      await service.setBillDiscount(capTenant(10), bill({ billDiscountCents: 50_000 }), {
        type: DiscountType.PERCENT,
        value: 0,
        actorUserId: "user-1",
        mayExceedCap: false,
      });

      const patch = queryBuilderSet();
      expect(patch.billDiscountCents).toBe(0);
      expect(patch.billDiscountType).toBeNull();
      expect(patch.totalCents).toBe(500_000);
    });

    it("will not discount a cancelled booking", async () => {
      await expect(
        service.setBillDiscount(capTenant(10), bill({ status: AppointmentStatus.CANCELLED }), {
          type: DiscountType.PERCENT,
          value: 5,
          actorUserId: "user-1",
          mayExceedCap: false,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "BAD_STATE" });
    });

    it("records who gave it away and why", async () => {
      await service.setBillDiscount(capTenant(10), bill(), {
        type: DiscountType.PERCENT,
        value: 10,
        reason: "  Regular customer  ",
        actorUserId: "user-1",
        mayExceedCap: false,
      });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "APPOINTMENT_DISCOUNT_APPLIED",
          actorUserId: "user-1",
          metadata: expect.objectContaining({ reason: "Regular customer", sharePercent: 10 }),
        }),
        expect.anything(),
      );
    });
  });
});
