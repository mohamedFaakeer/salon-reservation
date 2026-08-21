import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import {
  ApiError,
  AppointmentStatus,
  NotificationEvent,
  UserRole,
  type AddAppointmentServiceDto,
  type AppointmentQueryDto,
  type CancelAppointmentDto,
  type CreateAppointmentDto,
  type RemoveAppointmentServiceDto,
  type RescheduleAppointmentDto,
} from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Staff } from "../entities/staff.entity";
import type { TenantContextData } from "../tenant/tenant-context";
// TenantService/BookingService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BookingService } from "../booking/booking.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "../notification/notification.service";

const ELEVATED_ROLES: string[] = [UserRole.OWNER, UserRole.MANAGER, UserRole.RECEPTIONIST];
/** Never matches a real Staff row — forces an empty result set. */
const NO_MATCH_STAFF_ID = "00000000-0000-0000-0000-000000000000";

export interface AppointmentListResult {
  data: Appointment[];
  meta: { total: number; limit: number; offset: number };
}

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(AppointmentServiceLine) private readonly lines: Repository<AppointmentServiceLine>,
    private readonly tenantService: TenantService,
    private readonly booking: BookingService,
    private readonly notifications: NotificationService,
  ) {}

  /** POST /appointments — receptionist/walk-in/phone/WhatsApp, reserve+confirm in one request. */
  async create(
    tenantId: string,
    dto: CreateAppointmentDto,
    actorUserId: string,
    sessionKey: string,
  ): Promise<Appointment> {
    const tenant = await this.tenantService.findById(tenantId);
    return this.booking.reserveAndConfirm(
      tenant,
      {
        customerId: dto.customerId,
        newCustomer: dto.newCustomer,
        serviceIds: dto.serviceIds,
        staffId: dto.staffId,
        start: dto.start,
        source: dto.source,
        notes: dto.notes,
        checkInNow: dto.checkInNow,
      },
      sessionKey,
      actorUserId,
    );
  }

  async list(tenantId: string, query: AppointmentQueryDto, ctx: TenantContextData): Promise<AppointmentListResult> {
    const staffId = await this.resolveStaffFilter(tenantId, ctx, query.staffId);

    const qb = this.appointments
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.customer", "customer")
      .where("a.tenantId = :tenantId", { tenantId });
    if (query.date) {
      qb.andWhere("a.appointmentDate = :date", { date: query.date });
    }
    if (query.status) {
      qb.andWhere("a.status = :status", { status: query.status });
    }
    if (query.customerId) {
      qb.andWhere("a.customerId = :customerId", { customerId: query.customerId });
    }
    if (staffId) {
      qb.andWhere("a.staffId = :staffId", { staffId });
    }
    const term = query.q?.trim();
    if (term) {
      const clauses = [
        'a."bookingReference" ILIKE :term',
        'customer."firstName" ILIKE :term',
        'customer."lastName" ILIKE :term',
        // Whoever types "Nimali Perera" gets nothing from the two clauses
        // above, because neither column holds the space.
        `(customer."firstName" || ' ' || customer."lastName") ILIKE :term`,
      ];
      const params: Record<string, string> = { term: `%${term}%` };

      const digits = localPhoneDigits(term);
      if (digits.length >= 3) {
        clauses.push(`${LOCAL_PHONE_SQL} LIKE :phone`);
        params.phone = `%${digits}%`;
      }

      qb.andWhere(`(${clauses.join(" OR ")})`, params);
    }
    qb.orderBy("a.startTime", "ASC").take(query.limit).skip(query.offset);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  async findOne(
    tenantId: string,
    id: string,
    ctx: TenantContextData,
  ): Promise<Appointment & { lines: AppointmentServiceLine[] }> {
    const appointment = await this.findOwned(tenantId, id);
    await this.assertOwnershipIfStaffOnly(tenantId, ctx, appointment);
    return this.attachLines(appointment);
  }

  /** OWNER/MANAGER/RECEPTIONIST only — gated at the controller, no ownership check needed here. */
  async checkIn(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.findOwned(tenantId, id);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError({
        statusCode: 400,
        code: "BAD_STATE",
        message: `Cannot check in an appointment with status ${appointment.status}.`,
      });
    }
    const now = new Date();
    appointment.status = AppointmentStatus.CHECKED_IN;
    appointment.checkedInAt = now;
    appointment.lateMinutes = Math.max(
      0,
      Math.round((now.getTime() - appointment.startTime.getTime()) / 60_000),
    );
    const saved = await this.appointments.save(appointment);

    const tenant = await this.tenantService.findById(tenantId);
    if (saved.lateMinutes > tenant.settings.noShowGraceMinutes) {
      try {
        await this.notifications.fire(tenant, NotificationEvent.LATE_ARRIVAL, saved, appointment.customer);
      } catch {
        // Notification failure must never surface as an error to the caller (PRD §3.10).
      }
    }

    return saved;
  }

  async inService(tenantId: string, id: string, ctx: TenantContextData): Promise<Appointment> {
    const appointment = await this.findOwned(tenantId, id);
    await this.assertOwnershipIfStaffOnly(tenantId, ctx, appointment);
    if (appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new ApiError({
        statusCode: 400,
        code: "BAD_STATE",
        message: `Cannot start service on an appointment with status ${appointment.status}.`,
      });
    }
    appointment.status = AppointmentStatus.IN_SERVICE;
    appointment.inServiceAt = new Date();
    return this.appointments.save(appointment);
  }

  async complete(tenantId: string, id: string, ctx: TenantContextData): Promise<Appointment> {
    const appointment = await this.findOwned(tenantId, id);
    await this.assertOwnershipIfStaffOnly(tenantId, ctx, appointment);
    if (
      appointment.status !== AppointmentStatus.CHECKED_IN &&
      appointment.status !== AppointmentStatus.IN_SERVICE
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "BAD_STATE",
        message: `Cannot complete an appointment with status ${appointment.status}.`,
      });
    }
    appointment.status = AppointmentStatus.COMPLETED;
    appointment.completedAt = new Date();
    return this.appointments.save(appointment);
  }

  /** OWNER/MANAGER/RECEPTIONIST only — gated at the controller, matching checkIn's ownership-free shape. */
  async cancel(tenantId: string, id: string, dto: CancelAppointmentDto, actorUserId: string): Promise<Appointment> {
    const appointment = await this.findOwned(tenantId, id);
    const tenant = await this.tenantService.findById(tenantId);
    return this.booking.cancelAppointment(tenant, appointment, {
      reason: dto.reason,
      actorUserId,
      isSelfService: false,
    });
  }

  async reschedule(
    tenantId: string,
    id: string,
    dto: RescheduleAppointmentDto,
    actorUserId: string,
  ): Promise<Appointment> {
    const appointment = await this.findOwned(tenantId, id);
    const tenant = await this.tenantService.findById(tenantId);
    return this.booking.rescheduleAppointment(tenant, appointment, {
      newStart: dto.newStart,
      newStaffId: dto.newStaffId,
      actorUserId,
      isSelfService: false,
    });
  }

  async noShow(tenantId: string, id: string, actorUserId: string): Promise<Appointment> {
    const appointment = await this.findOwned(tenantId, id);
    const tenant = await this.tenantService.findById(tenantId);
    return this.booking.markNoShow(tenant, appointment, { actorUserId });
  }

  /**
   * OWNER/MANAGER/RECEPTIONIST/STAFF (own) — a STAFF member may add a
   * service to their own appointment. Returns `lines` (not a default
   * relation) so the caller knows the new line's id, needed to remove it later.
   */
  async addService(
    tenantId: string,
    id: string,
    dto: AddAppointmentServiceDto,
    actorUserId: string,
    ctx: TenantContextData,
  ): Promise<Appointment & { lines: AppointmentServiceLine[] }> {
    const appointment = await this.findOwned(tenantId, id);
    await this.assertOwnershipIfStaffOnly(tenantId, ctx, appointment);
    const tenant = await this.tenantService.findById(tenantId);
    const result = await this.booking.addService(tenant, appointment, { serviceIds: dto.serviceIds, actorUserId });
    return this.attachLines(result);
  }

  /** OWNER/MANAGER/RECEPTIONIST only — gated at the controller, matching cancel/reschedule's ownership-free shape. */
  async removeService(
    tenantId: string,
    id: string,
    lineId: string,
    dto: RemoveAppointmentServiceDto,
    actorUserId: string,
  ): Promise<Appointment & { lines: AppointmentServiceLine[] }> {
    const appointment = await this.findOwned(tenantId, id);
    const tenant = await this.tenantService.findById(tenantId);
    const result = await this.booking.removeService(tenant, appointment, { lineId, reason: dto.reason, actorUserId });
    return this.attachLines(result);
  }

  private async findOwned(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.appointments.findOne({
      where: { id, tenantId },
      relations: { customer: true, staff: true },
    });
    if (!appointment) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Appointment not found." });
    }
    return appointment;
  }

  /** The detail view needs the booked service lines — not a loaded relation by default. */
  private async attachLines(appointment: Appointment): Promise<Appointment & { lines: AppointmentServiceLine[] }> {
    const lines = await this.lines.find({ where: { appointmentId: appointment.id } });
    return { ...appointment, lines };
  }

  private isElevated(ctx: TenantContextData): boolean {
    return ctx.roles.some((r) => ELEVATED_ROLES.includes(r));
  }

  private async resolveStaffFilter(
    tenantId: string,
    ctx: TenantContextData,
    requestedStaffId: string | undefined,
  ): Promise<string | undefined> {
    if (this.isElevated(ctx)) {
      return requestedStaffId;
    }
    const ownStaff = await this.staff.findOne({ where: { tenantId, userId: ctx.userId } });
    return ownStaff?.id ?? NO_MATCH_STAFF_ID;
  }

  /** S6 (SECURITY.md) — a STAFF member may only mutate their own appointments. */
  private async assertOwnershipIfStaffOnly(
    tenantId: string,
    ctx: TenantContextData,
    appointment: Appointment,
  ): Promise<void> {
    if (this.isElevated(ctx)) {
      return;
    }
    const ownStaff = await this.staff.findOne({ where: { tenantId, userId: ctx.userId } });
    if (!ownStaff || ownStaff.id !== appointment.staffId) {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You can only manage your own appointments.",
      });
    }
  }
}

/**
 * Phone search has to survive the two shapes the same Sri Lankan number takes.
 *
 * `normalizePhone` keeps digits and an optional leading "+", so the receptionist
 * who typed `077 123 4567` and the website that sent `+94771234567` produce two
 * different stored strings for one person. Searching either literal misses the
 * other, which is exactly the case a search box exists for.
 *
 * Both converge once the non-digits go and a leading `0` or country code `94`
 * is dropped: `0771234567` and `94771234567` both become `771234567`. The same
 * reduction is applied to the stored column in SQL below, so the two meet.
 */
function localPhoneDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^(0|94)/, "");
}

/**
 * The column-side half of `localPhoneDigits`.
 *
 * Not indexable, deliberately: this runs only inside an already tenant-scoped
 * and usually date-scoped query, over one salon's appointments, and an
 * expression index for a search box nobody has complained about would be
 * optimising ahead of evidence.
 */
const LOCAL_PHONE_SQL = `regexp_replace(regexp_replace(customer."phone", '[^0-9]', '', 'g'), '^(0|94)', '')`;
