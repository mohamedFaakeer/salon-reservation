import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { In, Repository } from "typeorm";
import {
  ApiError,
  isApiError,
  BookingSource,
  SlotHoldStatus,
  AppointmentStatus,
  NotificationEvent,
  PaymentMethod,
  PaymentProviderName,
  PaymentStatus,
  PaymentType,
  type CreateBookingDto,
  type CreateCustomerDto,
} from "@salon/shared";
import { Service } from "../entities/service.entity";
import { SlotHold, type BookingSnapshot, type BookingSnapshotLine } from "../entities/slot-hold.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Payment } from "../entities/payment.entity";
import { Refund } from "../entities/refund.entity";
import { Staff } from "../entities/staff.entity";
import type { Tenant } from "../entities/tenant.entity";
import { canBook } from "../availability/availability.engine";
import { colomboNow } from "../availability/time.util";
import { isExclusionViolation, isUniqueViolation } from "../common/postgres-errors.util";
import { generateBookingReference } from "../appointment/booking-reference.util";
import { normalizePhone } from "../customer/phone.util";
// AvailabilityService/CustomerService/AuditService must stay VALUE imports:
// NestJS resolves constructor injection via design:paramtypes metadata at
// runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AvailabilityService } from "../availability/availability.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "../customer/customer.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PricingService } from "../pricing/pricing.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RefundCalculator } from "../pricing/refund-calculator";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentService } from "../payment/payment.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "../notification/notification.service";

/** Maps `canBook`'s rejection codes to HTTP statuses (API.md §7's list is illustrative, not exhaustive). */
const CAN_BOOK_ERROR_STATUS: Record<string, number> = {
  STAFF_NOT_QUALIFIED: 400,
  OUTSIDE_BOOKING_WINDOW: 400,
  LEAD_TIME_VIOLATION: 400,
  STAFF_UNAVAILABLE: 409,
  OUTSIDE_WORKING_HOURS: 409,
  INSIDE_BREAK: 409,
  SLOT_UNAVAILABLE: 409,
};

export interface ReserveResult {
  holdId: string;
  amountCents: number;
  /** Display figure only: `amountCents - advanceRequiredCents` — the appointment's real `balanceCents` starts at `amountCents` until the advance is actually recorded. */
  advanceRequiredCents: number;
  balanceCents: number;
  expiresAt: Date;
  bookingReference: string;
}

const TERMINAL_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
  AppointmentStatus.COMPLETED,
]);

export interface CancelAppointmentInput {
  reason: string;
  actorUserId: string | null;
  isSelfService: boolean;
}

export interface RescheduleAppointmentInput {
  newStart: string;
  newStaffId?: string;
  actorUserId: string | null;
  isSelfService: boolean;
}

export interface MarkNoShowInput {
  actorUserId: string | null;
}

export interface AddServiceInput {
  serviceIds: string[];
  actorUserId: string | null;
}

export interface RemoveServiceInput {
  lineId: string;
  reason: string;
  actorUserId: string | null;
}

export interface ReserveAndConfirmInput {
  customerId?: string;
  newCustomer?: CreateCustomerDto;
  serviceIds: string[];
  staffId: string;
  start: string;
  source: BookingSource;
  notes?: string;
  checkInNow?: boolean;
}

interface AppointmentInsertSpec {
  customerId: string;
  staffId: string;
  startTime: Date;
  endTime: Date;
  source: BookingSource;
  lines: BookingSnapshotLine[];
  notes: string | null;
  holdExpiresAt: Date | null;
  checkInNow?: boolean;
  /** Pre-chosen (online flow, from `reserve`); generated fresh if omitted (receptionist flow). */
  bookingReference?: string;
}

@Injectable()
export class BookingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(SlotHold) private readonly slotHolds: Repository<SlotHold>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AppointmentServiceLine)
    private readonly appointmentServiceLines: Repository<AppointmentServiceLine>,
    private readonly availability: AvailabilityService,
    private readonly customers: CustomerService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentService,
    private readonly refundCalculator: RefundCalculator,
    private readonly notifications: NotificationService,
  ) {}

  /** GET /bookings/:reference?phone= — no :slug in this route; bookingReference is globally unique. */
  async findByReferenceAndPhone(
    reference: string,
    phone: string,
  ): Promise<Appointment & { lines: AppointmentServiceLine[]; salonSlug: string }> {
    const appointment = await this.appointments.findOne({
      where: { bookingReference: reference },
      relations: { customer: true, staff: true, tenant: true },
    });
    if (!appointment || appointment.customer.phone !== normalizePhone(phone)) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Booking not found." });
    }
    const lines = await this.appointmentServiceLines.find({ where: { appointmentId: appointment.id } });
    return { ...appointment, lines, salonSlug: appointment.tenant.slug };
  }

  /** `/payments/:intentId/...` routes carry no slug — derive the tenant from the hold row itself. */
  async resolveTenantIdForHold(holdId: string): Promise<string> {
    const hold = await this.slotHolds.findOne({ where: { id: holdId } });
    if (!hold) {
      throw new ApiError({ statusCode: 404, code: "HOLD_NOT_FOUND", message: "Payment intent not found." });
    }
    return hold.tenantId;
  }

  /** POST /salons/:slug/bookings — creates a 10-min HELD SlotHold; no Appointment yet. */
  async reserve(tenant: Tenant, dto: CreateBookingDto, sessionKey: string): Promise<ReserveResult> {
    const lines = await this.resolveServiceLines(tenant.id, dto.serviceIds);
    const totals = this.pricing.computeTotals(lines, tenant.settings);
    const amountCents = totals.totalCents;
    const durationMin = lines.reduce((sum, l) => sum + l.durationMinSnapshot, 0);
    const start = new Date(dto.start);
    const end = new Date(start.getTime() + durationMin * 60_000);
    const localDate = colomboNow(start).date;

    const holdResult = (hold: SlotHold): ReserveResult => ({
      holdId: hold.id,
      amountCents,
      advanceRequiredCents: totals.advanceRequiredCents,
      balanceCents: totals.balanceCents,
      expiresAt: hold.expiresAt,
      bookingReference: (hold.bookingSnapshot as BookingSnapshot).bookingReference,
    });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const slotHoldRepo = manager.getRepository(SlotHold);

        // Idempotent retry: an existing hold for this Idempotency-Key wins outright.
        const existing = await slotHoldRepo.findOne({ where: { tenantId: tenant.id, sessionKey } });
        if (existing) {
          return holdResult(existing);
        }

        const [staffContext, salonClosed, qualified] = await Promise.all([
          this.availability.loadStaffContext(tenant.id, dto.staffId, localDate),
          this.availability.isSalonClosed(tenant.id, localDate),
          this.availability.isQualified(tenant.id, dto.staffId, dto.serviceIds),
        ]);
        try {
          this.assertCanBook(start, end, qualified, staffContext, salonClosed, tenant);
        } catch (err) {
          // The staff/time conflict this just detected may be the racing
          // twin of *this same* Idempotency-Key retry, which can commit its
          // hold in the gap between this transaction's own sessionKey
          // pre-check (above) and this in-app availability check — a TOCTOU
          // window distinct from the DB-constraint race handled below. If a
          // same-sessionKey hold exists now, this was that retry finishing,
          // not a genuine conflict.
          if (isApiError(err) && err.code === "SLOT_UNAVAILABLE") {
            const winner = await slotHoldRepo.findOne({ where: { tenantId: tenant.id, sessionKey } });
            if (winner) {
              return holdResult(winner);
            }
          }
          throw err;
        }

        await this.sweepExpiredHolds(manager, tenant.id, dto.staffId);

        const customer = await this.customers.findOrCreateForBooking(tenant.id, dto.customer, manager);
        // Chosen now (not at confirm) so the reference shown to the customer never changes.
        const bookingReference = await this.generateUniqueBookingReference(manager, tenant);
        const snapshot: BookingSnapshot = {
          customerId: customer.id,
          notes: dto.notes?.trim() ?? null,
          lines,
          bookingReference,
        };

        // Race: two requests with the same Idempotency-Key both passed the
        // pre-check above. The loser's insert violates a constraint — but
        // when both requests target the identical slot (the common retry
        // case), it can violate *either* the unique (tenantId, sessionKey)
        // index or the staff+time exclusion constraint, depending on which
        // one Postgres evaluates first; which one fires is not something
        // this code controls. Left untranslated here so the outer catch can
        // check for a same-sessionKey winner regardless of which constraint
        // reported the violation, before ever concluding this was a genuine
        // slot conflict.
        const hold = await slotHoldRepo.save(
          slotHoldRepo.create({
            tenantId: tenant.id,
            staffId: dto.staffId,
            startTime: start,
            endTime: end,
            status: SlotHoldStatus.HELD,
            expiresAt: new Date(Date.now() + 10 * 60_000),
            sessionKey,
            bookingSnapshot: snapshot,
          }),
        );

        return holdResult(hold);
      });
    } catch (err) {
      if (isUniqueViolation(err) || isExclusionViolation(err)) {
        // The winner's hold is re-read *outside* this transaction (after the
        // winner commits) — idempotent retry, never a duplicate (API.md §1).
        // A same-sessionKey winner existing is proof this was a retry, not a
        // genuine conflict, no matter which constraint the loser tripped.
        const winner = await this.slotHolds.findOne({ where: { tenantId: tenant.id, sessionKey } });
        if (winner) {
          return holdResult(winner);
        }
      }
      throw this.translateSlotUnavailable(err);
    }
  }

  /** POST /payments/:intentId/confirm — hold→appointment, same transaction. */
  async confirmHold(
    tenant: Tenant,
    holdId: string,
    sessionKey: string,
  ): Promise<{ appointment: Appointment & { staff: Staff; lines: AppointmentServiceLine[] }; bookingReference: string }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const slotHoldRepo = manager.getRepository(SlotHold);
      const hold = await slotHoldRepo.findOne({ where: { id: holdId, tenantId: tenant.id } });
      if (!hold) {
        throw new ApiError({ statusCode: 404, code: "HOLD_NOT_FOUND", message: "Payment intent not found." });
      }

      if (hold.status === SlotHoldStatus.CONSUMED) {
        if (hold.sessionKey !== sessionKey) {
          throw new ApiError({
            statusCode: 409,
            code: "HOLD_EXPIRED",
            message: "This payment intent has already been used.",
          });
        }
        const appointment = await manager.getRepository(Appointment).findOne({
          where: { tenantId: tenant.id, staffId: hold.staffId, startTime: hold.startTime },
        });
        if (!appointment) {
          throw new ApiError({
            statusCode: 409,
            code: "HOLD_EXPIRED",
            message: "This payment intent could not be confirmed.",
          });
        }
        const enriched = await this.attachStaffAndLines(manager, appointment);
        // Idempotent replay — notifications already fired on the original confirm.
        return { appointment: enriched, bookingReference: appointment.bookingReference, fresh: false };
      }

      if (hold.status !== SlotHoldStatus.HELD || hold.expiresAt <= new Date() || !hold.bookingSnapshot) {
        throw new ApiError({
          statusCode: 409,
          code: "HOLD_EXPIRED",
          message: "This hold has expired. Please start a new booking.",
        });
      }

      const snapshot = hold.bookingSnapshot;
      const appointment = await this.createAppointmentAtomic(manager, tenant, {
        customerId: snapshot.customerId,
        staffId: hold.staffId,
        startTime: hold.startTime,
        endTime: hold.endTime,
        source: BookingSource.ONLINE,
        lines: snapshot.lines,
        notes: snapshot.notes,
        holdExpiresAt: hold.expiresAt,
        bookingReference: snapshot.bookingReference,
      });

      // Same transaction as the appointment insert — either both commit or
      // neither does (payment matrix P1: no orphan payment/booking possible
      // with this synchronous, in-transaction ManualProvider).
      if (appointment.advanceRequiredCents > 0) {
        await this.payments.recordPayment(manager, tenant, appointment, {
          amountCents: appointment.advanceRequiredCents,
          method: PaymentMethod.ONLINE,
          type: appointment.advanceRequiredCents >= appointment.totalCents ? PaymentType.FULL : PaymentType.ADVANCE,
          provider: PaymentProviderName.MANUAL,
          recordedById: null,
          idempotencyKey: sessionKey,
        });
      }

      hold.status = SlotHoldStatus.CONSUMED;
      await slotHoldRepo.save(hold);

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: null,
          action: "APPOINTMENT_CREATED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { source: "ONLINE", bookingReference: appointment.bookingReference },
        },
        manager,
      );

      const enriched = await this.attachStaffAndLines(manager, appointment);
      return { appointment: enriched, bookingReference: appointment.bookingReference, fresh: true };
    });

    if (result.fresh) {
      await this.fireBestEffort(async () => {
        const customer = await this.customers.findById(tenant.id, result.appointment.customerId);
        await this.notifications.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, result.appointment, customer);
        if (result.appointment.advanceRequiredCents > 0) {
          await this.notifications.fire(tenant, NotificationEvent.PAYMENT_CONFIRMATION, result.appointment, customer);
        }
      });
    }

    return { appointment: result.appointment, bookingReference: result.bookingReference };
  }

  /** Notification failure must never surface as an error to the caller (PRD §3.10). */
  private async fireBestEffort(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch {
      // Swallowed deliberately — NotificationService itself already never
      // throws for delivery failures; this only guards against something
      // upstream (e.g. the customer lookup) going wrong.
    }
  }

  /** The success response needs the staff name + service lines to display — neither is a loaded relation by default. */
  private async attachStaffAndLines(
    manager: EntityManager,
    appointment: Appointment,
  ): Promise<Appointment & { staff: Staff; lines: AppointmentServiceLine[] }> {
    const [staff, lines] = await Promise.all([
      manager.getRepository(Staff).findOneOrFail({ where: { id: appointment.staffId } }),
      manager.getRepository(AppointmentServiceLine).find({ where: { appointmentId: appointment.id } }),
    ]);
    return { ...appointment, staff, lines };
  }

  /** POST /payments/:intentId/cancel — releases the hold; no appointment ever existed to expire. */
  async cancelHold(tenant: Tenant, holdId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const slotHoldRepo = manager.getRepository(SlotHold);
      const hold = await slotHoldRepo.findOne({ where: { id: holdId, tenantId: tenant.id } });
      if (!hold) {
        throw new ApiError({ statusCode: 404, code: "HOLD_NOT_FOUND", message: "Payment intent not found." });
      }
      if (hold.status === SlotHoldStatus.HELD) {
        hold.status = SlotHoldStatus.RELEASED;
        await slotHoldRepo.save(hold);
      }
    });
  }

  /**
   * POST /appointments/:id/cancel and POST /bookings/:reference/cancel —
   * same policy engine either way (CLAUDE.md: single source of truth).
   * Self-service is additionally gated by `selfServiceCutoffHours`.
   */
  async cancelAppointment(
    tenant: Tenant,
    appointment: Appointment,
    input: CancelAppointmentInput,
  ): Promise<Appointment> {
    const now = new Date();
    this.assertMutable(appointment, tenant, input.isSelfService, now);

    const result = await this.dataSource.transaction(async (manager) => {
      const refund = this.refundCalculator.computeRefund({
        startTime: appointment.startTime,
        now,
        isSelfService: input.isSelfService,
        policy: tenant.settings.cancellationPolicy,
        alreadyPaidCents: appointment.advancePaidCents,
        isNoShow: false,
      });

      if (refund.refundCents > 0) {
        await this.applyRefund(manager, tenant, appointment.id, refund.refundCents, input.actorUserId, "Cancellation refund");
      }

      await this.applyOptimisticUpdate(manager, appointment, {
        status: AppointmentStatus.CANCELLED,
        cancellationReason: input.reason,
        cancelledAt: now,
      });

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: input.actorUserId,
          action: "APPOINTMENT_CANCELLED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { reason: input.reason, refundCents: refund.refundCents },
        },
        manager,
      );

      return manager.getRepository(Appointment).findOneOrFail({ where: { id: appointment.id } });
    });

    await this.fireBestEffort(() =>
      this.notifications.fire(tenant, NotificationEvent.CANCELLATION_CONFIRMATION, result, appointment.customer),
    );

    return result;
  }

  /**
   * POST /appointments/:id/reschedule and POST /bookings/:reference/reschedule.
   * Creates a new Appointment for the new slot and marks the original
   * RESCHEDULED — never mutated in place (PRD.md §3.4). Both status changes
   * happen in one transaction, so a slot that becomes unavailable mid-flight
   * rolls the whole thing back and leaves the original genuinely untouched
   * (concurrency matrix §2.2.4).
   */
  async rescheduleAppointment(
    tenant: Tenant,
    appointment: Appointment,
    input: RescheduleAppointmentInput,
  ): Promise<Appointment> {
    const now = new Date();
    this.assertMutable(appointment, tenant, input.isSelfService, now);

    const staffId = input.newStaffId ?? appointment.staffId;
    const start = new Date(input.newStart);
    const activeLines = await this.appointmentServiceLines.find({
      where: { appointmentId: appointment.id, status: "ACTIVE" },
    });
    const durationMin = activeLines.reduce((sum, l) => sum + l.durationMinSnapshot, 0);
    const end = new Date(start.getTime() + durationMin * 60_000);
    const localDate = colomboNow(start).date;
    const serviceIds = activeLines.map((l) => l.serviceId).filter((id): id is string => Boolean(id));

    const [staffContext, salonClosed, qualified] = await Promise.all([
      this.availability.loadStaffContext(tenant.id, staffId, localDate),
      this.availability.isSalonClosed(tenant.id, localDate),
      this.availability.isQualified(tenant.id, staffId, serviceIds),
    ]);
    // The appointment being rescheduled is still active (hence still in its
    // own busyIntervals) at this point — exclude its own current window so a
    // target slot that only overlaps the booking it's replacing isn't
    // rejected as a false self-conflict. The DB-level exclusion constraint
    // guards the real insert below regardless.
    const ownStartMin = colomboNow(appointment.startTime).minutes;
    const ownEndMin = colomboNow(appointment.endTime).minutes;
    const contextForCheck = {
      ...staffContext,
      busyIntervals: staffContext.busyIntervals.filter(
        (b) => !(b.startMin === ownStartMin && b.endMin === ownEndMin),
      ),
    };
    this.assertCanBook(start, end, qualified, contextForCheck, salonClosed, tenant);

    const result = await this.dataSource.transaction(async (manager) => {
      // Frees the original's slot (the exclusion constraint's WHERE clause
      // only covers active statuses) before the new slot is inserted, both
      // in this one transaction.
      await this.applyOptimisticUpdate(manager, appointment, { status: AppointmentStatus.RESCHEDULED });

      const snapshotLines: BookingSnapshotLine[] = activeLines.map((l) => ({
        serviceId: l.serviceId ?? "",
        nameSnapshot: l.nameSnapshot,
        durationMinSnapshot: l.durationMinSnapshot,
        priceCentsSnapshot: l.priceCentsSnapshot,
      }));

      const newAppointment = await this.createAppointmentAtomic(manager, tenant, {
        customerId: appointment.customerId,
        staffId,
        startTime: start,
        endTime: end,
        source: appointment.source,
        lines: snapshotLines,
        notes: appointment.notes,
        holdExpiresAt: null,
      });

      // No re-pricing on reschedule (same services, same prices) — inherit
      // the original's actual paid/owed state instead of PricingService's
      // fresh "nothing paid yet" defaults.
      const appointmentRepo = manager.getRepository(Appointment);
      await appointmentRepo.update(newAppointment.id, {
        rescheduledFromId: appointment.id,
        advancePaidCents: appointment.advancePaidCents,
        balanceCents: appointment.totalCents - appointment.advancePaidCents,
      });
      await manager
        .getRepository(Payment)
        .update({ appointmentId: appointment.id }, { appointmentId: newAppointment.id });

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: input.actorUserId,
          action: "APPOINTMENT_RESCHEDULED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { newAppointmentId: newAppointment.id },
        },
        manager,
      );
      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: input.actorUserId,
          action: "APPOINTMENT_RESCHEDULED",
          entityType: "Appointment",
          entityId: newAppointment.id,
          metadata: { rescheduledFromId: appointment.id },
        },
        manager,
      );

      return appointmentRepo.findOneOrFail({ where: { id: newAppointment.id } });
    });

    await this.fireBestEffort(() =>
      this.notifications.fire(tenant, NotificationEvent.RESCHEDULE_CONFIRMATION, result, appointment.customer),
    );

    return result;
  }

  /**
   * POST /appointments/:id/no-show — "no-show converter ≤ grace" (P14):
   * a validation gate on this manual action, not a scheduled job (no cron
   * infrastructure exists in this codebase yet).
   */
  async markNoShow(tenant: Tenant, appointment: Appointment, input: MarkNoShowInput): Promise<Appointment> {
    if (appointment.status !== AppointmentStatus.CONFIRMED && appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new ApiError({
        statusCode: 400,
        code: "BAD_STATE",
        message: `Cannot mark no-show for an appointment with status ${appointment.status}.`,
      });
    }
    const now = new Date();
    const graceMs = tenant.settings.noShowGraceMinutes * 60_000;
    if (now.getTime() < appointment.startTime.getTime() + graceMs) {
      throw new ApiError({
        statusCode: 400,
        code: "BAD_STATE",
        message: "The no-show grace period hasn't elapsed yet.",
      });
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const refund = this.refundCalculator.computeRefund({
        startTime: appointment.startTime,
        now,
        isSelfService: false,
        policy: tenant.settings.cancellationPolicy,
        alreadyPaidCents: appointment.advancePaidCents,
        isNoShow: true,
      });

      if (refund.refundCents > 0) {
        await this.applyRefund(manager, tenant, appointment.id, refund.refundCents, input.actorUserId, "No-show refund");
      }

      await this.applyOptimisticUpdate(manager, appointment, { status: AppointmentStatus.NO_SHOW });

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: input.actorUserId,
          action: "APPOINTMENT_NO_SHOW",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { refundCents: refund.refundCents },
        },
        manager,
      );

      return manager.getRepository(Appointment).findOneOrFail({ where: { id: appointment.id } });
    });

    await this.fireBestEffort(() =>
      this.notifications.fire(tenant, NotificationEvent.NO_SHOW, result, appointment.customer),
    );

    return result;
  }

  /**
   * POST /appointments/:id/services (API.md §3) — appends new service lines
   * to an already-confirmed appointment and recomputes totals. Doesn't touch
   * `startTime`/`endTime`: the documented contract only mentions "recomputes
   * totals," so the appointment's slot stays fixed rather than re-running
   * the availability engine for what's scoped as a pricing-only operation.
   */
  async addService(tenant: Tenant, appointment: Appointment, input: AddServiceInput): Promise<Appointment> {
    this.assertMutable(appointment, tenant, false, new Date());
    const newLines = await this.resolveServiceLines(tenant.id, input.serviceIds);

    return this.dataSource.transaction(async (manager) => {
      const lineRepo = manager.getRepository(AppointmentServiceLine);
      await lineRepo.save(
        newLines.map((l) =>
          lineRepo.create({
            appointmentId: appointment.id,
            serviceId: l.serviceId,
            nameSnapshot: l.nameSnapshot,
            durationMinSnapshot: l.durationMinSnapshot,
            priceCentsSnapshot: l.priceCentsSnapshot,
            status: "ACTIVE",
          }),
        ),
      );

      const activeLines = await lineRepo.find({ where: { appointmentId: appointment.id, status: "ACTIVE" } });
      const subtotalCents = activeLines.reduce((sum, l) => sum + l.priceCentsSnapshot, 0);
      const totalCents = subtotalCents - appointment.discountCents;
      const balanceCents = totalCents - appointment.advancePaidCents;

      await this.applyOptimisticUpdate(manager, appointment, { subtotalCents, totalCents, balanceCents });

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: input.actorUserId,
          action: "APPOINTMENT_SERVICE_ADDED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { serviceIds: input.serviceIds, totalCents },
        },
        manager,
      );

      return manager.getRepository(Appointment).findOneOrFail({ where: { id: appointment.id } });
    });
  }

  /**
   * DELETE /appointments/:id/services/:appointmentServiceId (API.md §3) —
   * marks a line REMOVED (never hard-deleted) and recomputes totals. If the
   * amount already paid now exceeds the new total, the difference is
   * refunded via the same FIFO `applyRefund` helper cancel/no-show use —
   * this is a plain overpayment calculation, not a `RefundCalculator`
   * policy-percentage refund (there's no cutoff/no-show concept for "a
   * service was dropped mid-appointment").
   */
  async removeService(tenant: Tenant, appointment: Appointment, input: RemoveServiceInput): Promise<Appointment> {
    this.assertMutable(appointment, tenant, false, new Date());

    return this.dataSource.transaction(async (manager) => {
      const lineRepo = manager.getRepository(AppointmentServiceLine);
      const line = await lineRepo.findOne({ where: { id: input.lineId, appointmentId: appointment.id } });
      if (!line || line.status === "REMOVED") {
        throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Service line not found." });
      }

      const activeLines = await lineRepo.find({ where: { appointmentId: appointment.id, status: "ACTIVE" } });
      if (activeLines.length <= 1) {
        throw new ApiError({
          statusCode: 400,
          code: "BAD_STATE",
          message: "An appointment must have at least one active service.",
        });
      }

      line.status = "REMOVED";
      line.removedById = input.actorUserId;
      line.removedAt = new Date();
      line.removedReason = input.reason;
      await lineRepo.save(line);

      const subtotalCents = activeLines
        .filter((l) => l.id !== line.id)
        .reduce((sum, l) => sum + l.priceCentsSnapshot, 0);
      const totalCents = subtotalCents - appointment.discountCents;
      const refundCents = Math.max(0, appointment.advancePaidCents - totalCents);

      if (refundCents > 0) {
        await this.applyRefund(manager, tenant, appointment.id, refundCents, input.actorUserId, "Service removed");
      }

      // `refundWithManager` (inside applyRefund) writes `advancePaidCents`/`balanceCents`
      // directly, bypassing this class's own in-memory `appointment` object — re-read
      // before computing the final balance so this write doesn't clobber that one.
      const refreshedAppointment = await manager
        .getRepository(Appointment)
        .findOneOrFail({ where: { id: appointment.id } });
      const balanceCents = totalCents - refreshedAppointment.advancePaidCents;

      await this.applyOptimisticUpdate(manager, refreshedAppointment, { subtotalCents, totalCents, balanceCents });

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId: input.actorUserId,
          action: "APPOINTMENT_SERVICE_REMOVED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { lineId: input.lineId, reason: input.reason, refundCents, totalCents },
        },
        manager,
      );

      return manager.getRepository(Appointment).findOneOrFail({ where: { id: appointment.id } });
    });
  }

  /** Shared by cancel/reschedule: not already terminal, and (if self-service) still outside the cutoff window. */
  private assertMutable(appointment: Appointment, tenant: Tenant, isSelfService: boolean, now: Date): void {
    if (TERMINAL_STATUSES.has(appointment.status)) {
      throw new ApiError({
        statusCode: 409,
        code: "APPOINTMENT_NOT_CANCELLABLE",
        message: `This appointment is already ${appointment.status.toLowerCase()} and cannot be changed.`,
      });
    }
    if (isSelfService) {
      const cutoffHours = tenant.settings.cancellationPolicy.selfServiceCutoffHours;
      const cutoff = new Date(appointment.startTime.getTime() - cutoffHours * 60 * 60_000);
      if (now >= cutoff) {
        throw new ApiError({
          statusCode: 409,
          code: "APPOINTMENT_NOT_CANCELLABLE",
          message: "This booking can no longer be changed online. Please call the salon.",
        });
      }
    }
  }

  /** FIFO allocation across the appointment's refundable payments (oldest first) until `refundCents` is exhausted. */
  private async applyRefund(
    manager: EntityManager,
    tenant: Tenant,
    appointmentId: string,
    refundCents: number,
    actorUserId: string | null,
    reason: string,
  ): Promise<void> {
    const paymentRepo = manager.getRepository(Payment);
    const refundRepo = manager.getRepository(Refund);
    const candidates = await paymentRepo.find({
      where: { appointmentId, state: In([PaymentStatus.SUCCESS, PaymentStatus.PARTIALLY_REFUNDED]) },
      order: { createdAt: "ASC" },
    });

    let remaining = refundCents;
    for (const payment of candidates) {
      if (remaining <= 0) {
        break;
      }
      const priorRefunds = await refundRepo.find({ where: { paymentId: payment.id } });
      const alreadyRefunded = priorRefunds.reduce((sum, r) => sum + r.amountCents, 0);
      const refundableFromThis = payment.amountCents - alreadyRefunded;
      if (refundableFromThis <= 0) {
        continue;
      }
      const amount = Math.min(remaining, refundableFromThis);
      await this.payments.refundWithManager(manager, tenant, payment.id, { amountCents: amount, reason }, actorUserId);
      remaining -= amount;
    }
  }

  /** DATABASE.md §3.3: `UPDATE ... WHERE id=$1 AND version=$2`; 0 rows affected → 409 VERSION_CONFLICT. */
  private async applyOptimisticUpdate(
    manager: EntityManager,
    appointment: Appointment,
    patch: Partial<
      Pick<
        Appointment,
        | "status"
        | "cancellationReason"
        | "cancelledAt"
        | "subtotalCents"
        | "totalCents"
        | "balanceCents"
        | "advancePaidCents"
      >
    >,
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(Appointment)
      .set({ ...patch, version: () => '"version" + 1' })
      .where("id = :id AND version = :version", { id: appointment.id, version: appointment.version })
      .execute();
    if (!result.affected) {
      throw new ApiError({
        statusCode: 409,
        code: "VERSION_CONFLICT",
        message: "This appointment was just modified elsewhere. Please refresh and try again.",
      });
    }
  }

  /**
   * POST /appointments (receptionist/walk-in/phone/WhatsApp) — reserve +
   * confirm inside one transaction, one request; appointment `CONFIRMED`
   * immediately (or `CHECKED_IN` if `checkInNow`). Reuses the same
   * `canBook`/snapshot/atomic-insert machinery as the online flow.
   */
  async reserveAndConfirm(
    tenant: Tenant,
    input: ReserveAndConfirmInput,
    sessionKey: string,
    actorUserId: string,
  ): Promise<Appointment> {
    if (!input.customerId && !input.newCustomer) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Provide either customerId or newCustomer.",
      });
    }

    const lines = await this.resolveServiceLines(tenant.id, input.serviceIds);
    const durationMin = lines.reduce((sum, l) => sum + l.durationMinSnapshot, 0);
    const start = new Date(input.start);
    const end = new Date(start.getTime() + durationMin * 60_000);
    const localDate = colomboNow(start).date;

    const result = await this.dataSource.transaction(async (manager) => {
      const slotHoldRepo = manager.getRepository(SlotHold);

      const existingHold = await slotHoldRepo.findOne({ where: { tenantId: tenant.id, sessionKey } });
      if (existingHold) {
        const appointment = await manager.getRepository(Appointment).findOne({
          where: { tenantId: tenant.id, staffId: existingHold.staffId, startTime: existingHold.startTime },
        });
        if (appointment) {
          // Idempotent replay — notification already fired on the original request.
          return { appointment, customer: null, fresh: false };
        }
      }

      const [staffContext, salonClosed, qualified] = await Promise.all([
        this.availability.loadStaffContext(tenant.id, input.staffId, localDate),
        this.availability.isSalonClosed(tenant.id, localDate),
        this.availability.isQualified(tenant.id, input.staffId, input.serviceIds),
      ]);
      this.assertCanBook(start, end, qualified, staffContext, salonClosed, tenant);

      await this.sweepExpiredHolds(manager, tenant.id, input.staffId);

      const customer = input.customerId
        ? await this.customers.findById(tenant.id, input.customerId)
        : await this.customers.create(tenant.id, input.newCustomer!, manager);

      const appointment = await this.createAppointmentAtomic(manager, tenant, {
        customerId: customer.id,
        staffId: input.staffId,
        startTime: start,
        endTime: end,
        source: input.source,
        lines,
        notes: input.notes?.trim() ?? null,
        holdExpiresAt: null,
        checkInNow: input.checkInNow,
      });

      // Marker row only, for sessionKey-based idempotent retries — this
      // flow never needs a HELD waiting period, so it's recorded already
      // CONSUMED; the appointment table's own exclusion constraint is what
      // actually guards this insert (see DECISIONS.md).
      await slotHoldRepo.save(
        slotHoldRepo.create({
          tenantId: tenant.id,
          staffId: input.staffId,
          startTime: start,
          endTime: end,
          status: SlotHoldStatus.CONSUMED,
          expiresAt: new Date(),
          sessionKey,
          bookingSnapshot: { customerId: customer.id, notes: input.notes?.trim() ?? null, lines },
        }),
      );

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "APPOINTMENT_CREATED",
          entityType: "Appointment",
          entityId: appointment.id,
          metadata: { source: input.source, bookingReference: appointment.bookingReference },
        },
        manager,
      );

      return { appointment, customer, fresh: true };
    });

    if (result.fresh && result.customer) {
      await this.fireBestEffort(() =>
        this.notifications.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, result.appointment, result.customer!),
      );
    }

    return result.appointment;
  }

  private assertCanBook(
    start: Date,
    end: Date,
    qualified: boolean,
    staffContext: Parameters<typeof canBook>[0]["staff"],
    salonClosed: boolean,
    tenant: Tenant,
  ): void {
    const validation = canBook({
      start,
      end,
      qualified,
      staff: staffContext,
      salonClosed,
      now: new Date(),
      sameDayLeadMinutes: tenant.settings.sameDayLeadMinutes,
      bookingWindowDays: tenant.settings.bookingWindowDays,
    });
    if (!validation.ok) {
      throw new ApiError({
        statusCode: CAN_BOOK_ERROR_STATUS[validation.code] ?? 409,
        code: validation.code,
        message: validation.message,
      });
    }
  }

  /** A genuinely expired HELD row must not block the exclusion constraint — no scheduled sweeper exists yet. */
  private async sweepExpiredHolds(manager: EntityManager, tenantId: string, staffId: string): Promise<void> {
    await manager.query(
      `UPDATE "slot_hold" SET status = 'EXPIRED' WHERE "tenantId" = $1 AND "staffId" = $2 AND status = 'HELD' AND "expiresAt" <= now()`,
      [tenantId, staffId],
    );
  }

  private async createAppointmentAtomic(
    manager: EntityManager,
    tenant: Tenant,
    spec: AppointmentInsertSpec,
  ): Promise<Appointment> {
    const appointmentRepo = manager.getRepository(Appointment);
    const lineRepo = manager.getRepository(AppointmentServiceLine);
    const totals = this.pricing.computeTotals(spec.lines, tenant.settings);
    const appointmentDate = colomboNow(spec.startTime).date;
    const now = new Date();

    let appointment: Appointment | undefined;
    for (let attempt = 0; attempt < 5 && !appointment; attempt++) {
      const bookingReference =
        attempt === 0 && spec.bookingReference ? spec.bookingReference : generateBookingReference(tenant.slug);
      try {
        appointment = await appointmentRepo.save(
          appointmentRepo.create({
            tenantId: tenant.id,
            branchId: null,
            customerId: spec.customerId,
            staffId: spec.staffId,
            appointmentDate,
            startTime: spec.startTime,
            endTime: spec.endTime,
            status: spec.checkInNow ? AppointmentStatus.CHECKED_IN : AppointmentStatus.CONFIRMED,
            source: spec.source,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            totalCents: totals.totalCents,
            advanceRequiredCents: totals.advanceRequiredCents,
            advancePaidCents: 0,
            // Nothing is paid yet at creation — balanceCents starts equal to
            // totalCents and is only ever reduced by a real recordPayment()
            // call (e.g. the advance recorded immediately below in
            // confirmHold, same transaction). PricingService's own
            // `balanceCents` (total minus advance) is a *display* figure for
            // "what you'd still owe after paying the advance" — writing it
            // here directly would double-count once the advance payment
            // itself also decrements this column.
            balanceCents: totals.totalCents,
            notes: spec.notes,
            bookingReference,
            holdExpiresAt: spec.holdExpiresAt,
            checkedInAt: spec.checkInNow ? now : null,
            lateMinutes: spec.checkInNow
              ? Math.max(0, Math.round((now.getTime() - spec.startTime.getTime()) / 60_000))
              : 0,
            version: 1,
          }),
        );
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 4) {
          continue;
        }
        throw this.translateSlotUnavailable(err);
      }
    }
    if (!appointment) {
      throw new Error("Failed to generate a unique booking reference after 5 attempts.");
    }

    await lineRepo.save(
      spec.lines.map((l) =>
        lineRepo.create({
          appointmentId: (appointment as Appointment).id,
          serviceId: l.serviceId,
          nameSnapshot: l.nameSnapshot,
          durationMinSnapshot: l.durationMinSnapshot,
          priceCentsSnapshot: l.priceCentsSnapshot,
          status: "ACTIVE",
        }),
      ),
    );

    return appointment;
  }

  /**
   * Pre-checked against `Appointment` (not just relying on the DB unique
   * index) so the reference chosen at reserve time is the same one shown
   * on the confirmed appointment — a customer's booking reference should
   * never silently change between the two steps.
   */
  private async generateUniqueBookingReference(manager: EntityManager, tenant: Tenant): Promise<string> {
    const appointmentRepo = manager.getRepository(Appointment);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateBookingReference(tenant.slug);
      const exists = await appointmentRepo.findOne({ where: { bookingReference: candidate } });
      if (!exists) {
        return candidate;
      }
    }
    throw new Error("Failed to generate a unique booking reference after 5 attempts.");
  }

  private translateSlotUnavailable(err: unknown): unknown {
    if (isExclusionViolation(err)) {
      return new ApiError({
        statusCode: 409,
        code: "SLOT_UNAVAILABLE",
        message: "That slot was just booked by another customer. Please choose another time.",
      });
    }
    return err;
  }

  private async resolveServiceLines(tenantId: string, serviceIds: string[]): Promise<BookingSnapshotLine[]> {
    const requested = new Set(serviceIds);
    const rows = await this.services.find({
      where: { id: In(serviceIds), tenantId, active: true },
    });
    if (rows.length !== requested.size) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
        message: "One or more requested services do not exist.",
      });
    }
    return rows.map((s) => ({
      serviceId: s.id,
      nameSnapshot: s.name,
      durationMinSnapshot: s.durationMin,
      priceCentsSnapshot: s.priceCents,
    }));
  }
}
