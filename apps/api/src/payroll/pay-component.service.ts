import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, PAY_COMPONENT_KIND, PayComponentType, type UpsertPayComponentDto } from "@salon/shared";
import { EmployeePayComponent } from "../entities/employee-pay-component.entity";
import { Staff } from "../entities/staff.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import type { PayComponentLine } from "./pay-component.domain";
import type { PayComponentView } from "./pay-component.types";

@Injectable()
export class PayComponentService {
  constructor(
    @InjectRepository(EmployeePayComponent) private readonly components: Repository<EmployeePayComponent>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, staffId?: string): Promise<PayComponentView[]> {
    const rows = await this.components.find({
      where: staffId ? { tenantId, staffId } : { tenantId },
      relations: { staff: true, createdByUser: true },
      order: { createdAt: "DESC" },
    });
    return rows.map(toView);
  }

  /** Every active component for a staff member, in the shape the earnings-bases calculation needs — no view/display fields. */
  async activeLines(tenantId: string, staffId: string): Promise<PayComponentLine[]> {
    const rows = await this.components.find({ where: { tenantId, staffId, active: true } });
    return rows.map((r) => ({
      type: r.type,
      kind: PAY_COMPONENT_KIND[r.type],
      amountCents: r.amountCents,
      epfApplicable: r.epfApplicable,
      etfApplicable: r.etfApplicable,
    }));
  }

  /**
   * Assigns a component, replacing any existing active one of the same
   * type for this staff member (never a second row — `UQ_employee_pay_component_active`
   * would reject it anyway, but the deactivate-then-create here keeps a
   * visible history rather than surfacing that as a raw constraint error).
   */
  async upsert(tenantId: string, staffId: string, dto: UpsertPayComponentDto, actorUserId: string): Promise<PayComponentView> {
    await this.assertStaffOwned(tenantId, staffId);
    if (dto.type === PayComponentType.OTHER_DEDUCTION && !dto.reason?.trim()) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "An 'other deduction' needs a reason — it's the one type that isn't self-explanatory.",
      });
    }

    const existing = await this.components.findOne({ where: { tenantId, staffId, type: dto.type, active: true } });
    if (existing) {
      existing.active = false;
      await this.components.save(existing);
    }

    const created = await this.components.save(
      this.components.create({
        tenantId,
        staffId,
        type: dto.type,
        amountCents: dto.amountCents,
        epfApplicable: dto.epfApplicable ?? false,
        etfApplicable: dto.etfApplicable ?? false,
        reason: dto.reason?.trim() ?? null,
        active: true,
        createdBy: actorUserId,
      }),
    );

    await this.audit.record({
      tenantId,
      actorUserId,
      action: existing ? "PAY_COMPONENT_UPDATED" : "PAY_COMPONENT_CREATED",
      entityType: "EmployeePayComponent",
      entityId: created.id,
      metadata: { staffId, type: dto.type, amountCents: dto.amountCents, supersedes: existing?.id ?? null },
    });

    return this.get(tenantId, created.id);
  }

  async deactivate(tenantId: string, id: string, actorUserId: string): Promise<PayComponentView> {
    const component = await this.findOwned(tenantId, id);
    if (!component.active) {
      throw new ApiError({ statusCode: 409, code: "PAY_COMPONENT_ALREADY_INACTIVE", message: "This is already inactive." });
    }
    component.active = false;
    await this.components.save(component);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "PAY_COMPONENT_DEACTIVATED",
      entityType: "EmployeePayComponent",
      entityId: component.id,
      metadata: { staffId: component.staffId, type: component.type },
    });

    return this.get(tenantId, id);
  }

  private async get(tenantId: string, id: string): Promise<PayComponentView> {
    return toView(await this.findOwned(tenantId, id));
  }

  private async findOwned(tenantId: string, id: string): Promise<EmployeePayComponent> {
    const row = await this.components.findOne({ where: { tenantId, id }, relations: { staff: true, createdByUser: true } });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "PAY_COMPONENT_NOT_FOUND", message: "Pay component not found." });
    }
    return row;
  }

  private async assertStaffOwned(tenantId: string, staffId: string): Promise<void> {
    const row = await this.staff.findOne({ where: { tenantId, id: staffId } });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "STAFF_NOT_FOUND", message: "Staff member not found." });
    }
  }
}

function toView(row: EmployeePayComponent): PayComponentView {
  return {
    id: row.id,
    staffId: row.staffId,
    staffName: row.staff?.name ?? "",
    type: row.type,
    kind: PAY_COMPONENT_KIND[row.type],
    amountCents: row.amountCents,
    epfApplicable: row.epfApplicable,
    etfApplicable: row.etfApplicable,
    reason: row.reason,
    active: row.active,
    createdByName: row.createdByUser?.name ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}
