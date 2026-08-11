import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, type CreateStaffLeaveDto } from "@salon/shared";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Staff } from "../entities/staff.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface CreateLeaveResult {
  leave: StaffLeave;
  /**
   * Always 0 until the Appointment entity exists (P10) — there is nothing to
   * query yet. Once appointments exist, this should count active
   * appointments for this staff member overlapping [startDate, endDate]
   * (PRD.md §3.9, API.md §3). Tracked, not silently stubbed — see
   * DECISIONS.md.
   */
  affectedAppointments: number;
}

@Injectable()
export class StaffLeaveService {
  constructor(
    @InjectRepository(StaffLeave) private readonly leaves: Repository<StaffLeave>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
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

    return { leave, affectedAppointments: 0 };
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
