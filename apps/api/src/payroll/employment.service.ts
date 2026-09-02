import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, IsNull, Repository } from "typeorm";
import { ApiError, type UpsertEmploymentDto } from "@salon/shared";
import { Employment } from "../entities/employment.entity";
import { Staff } from "../entities/staff.entity";
// AuditService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import { dayBefore } from "./payroll.domain";
import type { EmploymentView } from "./employment.types";

@Injectable()
export class EmploymentService {
  constructor(
    @InjectRepository(Employment) private readonly employments: Repository<Employment>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /** Every staff member who has ever had an employment profile, with their currently (or next) open version. */
  async listCurrent(tenantId: string): Promise<EmploymentView[]> {
    const rows = await this.employments.find({
      where: { tenantId, effectiveTo: IsNull() },
      relations: { staff: true, createdByUser: true },
      order: { effectiveFrom: "DESC" },
    });
    return rows.map(toView);
  }

  /** One staff member's full version history, newest first. */
  async history(tenantId: string, staffId: string): Promise<EmploymentView[]> {
    await this.findOwnedStaff(tenantId, staffId);
    const rows = await this.employments.find({
      where: { tenantId, staffId },
      relations: { staff: true, createdByUser: true },
      order: { effectiveFrom: "DESC" },
    });
    return rows.map(toView);
  }

  /**
   * Sets how a staff member is paid, effective the given date.
   *
   * The first call for a staff member creates their opening version. Every
   * call after that supersedes: the currently open version is closed the day
   * before the new one starts, and the new version is inserted with no
   * successor of its own yet — never an in-place edit, per the spec's own
   * "never overwrite a salary change" rule. `effectiveFrom` must be strictly
   * after the currently open version's own start date; changing what already
   * happened is a correction workflow this phase doesn't build yet, not a
   * silent rewrite of history.
   */
  async upsert(tenantId: string, staffId: string, dto: UpsertEmploymentDto, actorUserId: string): Promise<EmploymentView> {
    await this.findOwnedStaff(tenantId, staffId);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Employment);
      const open = await repo.findOne({ where: { tenantId, staffId, effectiveTo: IsNull() } });

      if (open && dto.effectiveFrom <= open.effectiveFrom) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_EFFECTIVE_DATE",
          message: `The new pay details must take effect after ${open.effectiveFrom}, when the current version started. To correct that version itself, void it first.`,
        });
      }

      if (open) {
        open.effectiveTo = dayBefore(dto.effectiveFrom);
        await repo.save(open);
      }

      const created = await repo.save(
        repo.create({
          tenantId,
          staffId,
          payFrequency: dto.payFrequency,
          baseRateCents: dto.baseRateCents,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: null,
          supersedesEmploymentId: open?.id ?? null,
          createdBy: actorUserId,
        }),
      );

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: open ? "PAYROLL_EMPLOYMENT_SUPERSEDED" : "PAYROLL_EMPLOYMENT_CREATED",
          entityType: "Employment",
          entityId: created.id,
          metadata: {
            staffId,
            payFrequency: dto.payFrequency,
            baseRateCents: dto.baseRateCents,
            effectiveFrom: dto.effectiveFrom,
            supersedes: open?.id ?? null,
          },
        },
        manager,
      );

      const reloaded = await manager.getRepository(Employment).findOne({
        where: { id: created.id },
        relations: { staff: true, createdByUser: true },
      });
      return toView(reloaded!);
    });
  }

  private async findOwnedStaff(tenantId: string, staffId: string): Promise<Staff> {
    const row = await this.staff.findOne({ where: { tenantId, id: staffId } });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "STAFF_NOT_FOUND", message: "Staff member not found." });
    }
    return row;
  }
}

function toView(row: Employment): EmploymentView {
  return {
    id: row.id,
    staffId: row.staffId,
    staffName: row.staff?.name ?? "",
    payFrequency: row.payFrequency,
    baseRateCents: row.baseRateCents,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    supersedesEmploymentId: row.supersedesEmploymentId,
    createdByName: row.createdByUser?.name ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}
