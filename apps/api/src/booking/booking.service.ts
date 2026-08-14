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
  BookingSource,
  SlotHoldStatus,
  AppointmentStatus,
  PaymentMethod,
  PaymentProviderName,
  PaymentType,
  type CreateBookingDto,
  type CreateCustomerDto,
} from "@salon/shared";
import { Service } from "../entities/service.entity";
import { SlotHold, type BookingSnapshot, type BookingSnapshotLine } from "../entities/slot-hold.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
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
import { PaymentService } from "../payment/payment.service";

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
  ) {}

  /** GET /bookings/:reference?phone= — no :slug in this route; bookingReference is globally unique. */
  async findByReferenceAndPhone(
    reference: string,
    phone: string,
  ): Promise<Appointment & { lines: AppointmentServiceLine[] }> {
    const appointment = await this.appointments.findOne({
      where: { bookingReference: reference },
      relations: { customer: true, staff: true },
    });
    if (!appointment || appointment.customer.phone !== normalizePhone(phone)) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Booking not found." });
    }
    const lines = await this.appointmentServiceLines.find({ where: { appointmentId: appointment.id } });
    return { ...appointment, lines };
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

    try {
      return await this.dataSource.transaction(async (manager) => {
        const slotHoldRepo = manager.getRepository(SlotHold);

        // Idempotent retry: an existing hold for this Idempotency-Key wins outright.
        const existing = await slotHoldRepo.findOne({ where: { tenantId: tenant.id, sessionKey } });
        if (existing) {
          return {
            holdId: existing.id,
            amountCents,
            advanceRequiredCents: totals.advanceRequiredCents,
            balanceCents: totals.balanceCents,
            expiresAt: existing.expiresAt,
            bookingReference: (existing.bookingSnapshot as BookingSnapshot).bookingReference,
          };
        }

        const [staffContext, salonClosed, qualified] = await Promise.all([
          this.availability.loadStaffContext(tenant.id, dto.staffId, localDate),
          this.availability.isSalonClosed(tenant.id, localDate),
          this.availability.isQualified(tenant.id, dto.staffId, dto.serviceIds),
        ]);
        this.assertCanBook(start, end, qualified, staffContext, salonClosed, tenant);

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

        let hold: SlotHold;
        try {
          hold = await slotHoldRepo.save(
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
        } catch (err) {
          // Race: two requests with the same Idempotency-Key both passed the
          // pre-check above; the unique (tenantId, sessionKey) index lets
          // exactly one insert win. The loser's transaction is aborted by the
          // violation, so the winner's hold is re-read *outside* this
          // transaction (after the winner commits) and returned — idempotent
          // retry, never a duplicate (API.md §1).
          throw this.translateSlotUnavailable(err);
        }

        return {
          holdId: hold.id,
          amountCents,
          advanceRequiredCents: totals.advanceRequiredCents,
          balanceCents: totals.balanceCents,
          expiresAt: hold.expiresAt,
          bookingReference,
        };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const winner = await this.slotHolds.findOne({ where: { tenantId: tenant.id, sessionKey } });
        if (winner) {
          return {
            holdId: winner.id,
            amountCents,
            advanceRequiredCents: totals.advanceRequiredCents,
            balanceCents: totals.balanceCents,
            expiresAt: winner.expiresAt,
            bookingReference: (winner.bookingSnapshot as BookingSnapshot).bookingReference,
          };
        }
      }
      throw err;
    }
  }

  /** POST /payments/:intentId/confirm — hold→appointment, same transaction. */
  async confirmHold(
    tenant: Tenant,
    holdId: string,
    sessionKey: string,
  ): Promise<{ appointment: Appointment & { staff: Staff; lines: AppointmentServiceLine[] }; bookingReference: string }> {
    return this.dataSource.transaction(async (manager) => {
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
        return { appointment: enriched, bookingReference: appointment.bookingReference };
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
      return { appointment: enriched, bookingReference: appointment.bookingReference };
    });
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

    return this.dataSource.transaction(async (manager) => {
      const slotHoldRepo = manager.getRepository(SlotHold);

      const existingHold = await slotHoldRepo.findOne({ where: { tenantId: tenant.id, sessionKey } });
      if (existingHold) {
        const appointment = await manager.getRepository(Appointment).findOne({
          where: { tenantId: tenant.id, staffId: existingHold.staffId, startTime: existingHold.startTime },
        });
        if (appointment) {
          return appointment;
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

      return appointment;
    });
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
