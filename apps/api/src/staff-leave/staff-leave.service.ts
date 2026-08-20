import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, In, Not, Repository } from "typeorm";
import { ApiError, AppointmentStatus, type CreateStaffLeaveDto } from "@salon/shared";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Staff } from "../entities/staff.entity";
import { Appointment } from "../entities/appointment.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface CreateLeaveResult {
  leave: StaffLeave;
  /**
   * Active appointments already booked for this staff member inside
   * [startDate, endDate] (PRD.md §3.9, API.md §3).
   *
   * Creating leave never cancels anything — nothing in this system destroys a
   * customer's booking as a side effect of an admin edit — so this count is
   * how the operator learns what they now have to deal with by hand.
   */
  affectedAppointments: number;
  /** The colliding appointments themselves, so the UI can name them. */
  affected: AffectedAppointment[];
}

export interface AffectedAppointment {
  id: string;
  appointmentDate: string;
  startTime: Date;
  bookingReference: string;
  customerName: string | null;
}

/**
 * Statuses that no longer occupy the stylist's day, mirroring
 * BookingService.TERMINAL_STATUSES. A cancelled or completed appointment is
 * not something leave strands.
 */
const INACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
  AppointmentStatus.COMPLETED,
];

@Injectable()
export class StaffLeaveService {
  constructor(
    @InjectRepository(StaffLeave) private readonly leaves: Repository<StaffLeave>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    staffId: string,
    dto: CreateStaffLeaveDto,
    createdBy: string,
  ): Promise<CreateLeaveResult> {
    await this.assertStaffOwned(tenantId, staffId);

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_DATE_RANGE",
        message: "endDate must be on or after startDate.",
      });
    }

    const leave = await this.leaves.save(
      this.leaves.create({
        tenantId,
        staffId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason?.trim() ?? null,
        createdBy,
      }),
    );

    await this.audit.record({
      tenantId,
      actorUserId: createdBy,
      action: "STAFF_LEAVE_CREATED",
      entityType: "StaffLeave",
      entityId: leave.id,
      metadata: { staffId, startDate: dto.startDate, endDate: dto.endDate },
    });

    const affected = await this.findAffected(tenantId, staffId, dto.startDate, dto.endDate);
    return { leave, affectedAppointments: affected.length, affected };
  }

  /**
   * Appointments this leave collides with. `appointmentDate` is a plain
   * `YYYY-MM-DD` column, so an inclusive BETWEEN over the leave's own dates is
   * both correct and index-friendly (IDX_appointment_staffId_appointmentDate)
   * — no timezone conversion is involved on either side.
   */
  async findAffected(
    tenantId: string,
    staffId: string,
    startDate: string,
    endDate: string,
  ): Promise<AffectedAppointment[]> {
    const rows = await this.appointments.find({
      where: {
        tenantId,
        staffId,
        appointmentDate: Between(startDate, endDate),
        status: Not(In(INACTIVE_STATUSES)),
      },
      relations: { customer: true },
      order: { appointmentDate: "ASC", startTime: "ASC" },
    });

    return rows.map((a) => ({
      id: a.id,
      appointmentDate: a.appointmentDate,
      startTime: a.startTime,
      bookingReference: a.bookingReference,
      customerName: a.customer ? `${a.customer.firstName} ${a.customer.lastName}` : null,
    }));
  }

  /**
   * All of the tenant's leave in one query.
   *
   * The availability board overlays leave on the rota, and used to call
   * `list` once per stylist to get it — one request per team member, growing
   * with the team, for a screen that always needs every row anyway.
   */
  async listAll(tenantId: string): Promise<StaffLeave[]> {
    return this.leaves.find({
      where: { tenantId },
      order: { startDate: "ASC" },
    });
  }

  async list(tenantId: string, staffId: string): Promise<StaffLeave[]> {
    await this.assertStaffOwned(tenantId, staffId);
    return this.leaves.find({
      where: { tenantId, staffId },
      order: { startDate: "ASC" },
    });
  }

  async remove(tenantId: string, staffId: string, id: string): Promise<void> {
    await this.assertStaffOwned(tenantId, staffId);
    const leave = await this.leaves.findOne({ where: { id, staffId, tenantId } });
    if (!leave) {
      throw new ApiError({
        statusCode: 404,
        code: "STAFF_LEAVE_NOT_FOUND",
        message: "Leave record not found.",
      });
    }
    await this.leaves.remove(leave);
  }

  private async assertStaffOwned(tenantId: string, staffId: string): Promise<void> {
    const staffMember = await this.staff.findOne({ where: { id: staffId, tenantId } });
    if (!staffMember) {
      throw new ApiError({
        statusCode: 404,
        code: "STAFF_NOT_FOUND",
        message: "Staff member not found.",
      });
    }
  }
}
