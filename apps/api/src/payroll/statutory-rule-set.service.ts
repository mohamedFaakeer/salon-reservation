import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, IsNull, Repository } from "typeorm";
import { ApiError, type UpsertStatutoryRuleSetDto } from "@salon/shared";
import { StatutoryRuleSet } from "../entities/statutory-rule-set.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import { dayBefore } from "./payroll.domain";
import type { StatutoryRuleSetView } from "./statutory-rule-set.types";

@Injectable()
export class StatutoryRuleSetService {
  constructor(
    @InjectRepository(StatutoryRuleSet) private readonly ruleSets: Repository<StatutoryRuleSet>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /** The version currently in force (or about to be) — `null` if none has ever been published. */
  async current(): Promise<StatutoryRuleSetView | null> {
    const row = await this.ruleSets.findOne({ where: { effectiveTo: IsNull() }, relations: { createdByUser: true } });
    return row ? toView(row) : null;
  }

  async history(): Promise<StatutoryRuleSetView[]> {
    const rows = await this.ruleSets.find({ relations: { createdByUser: true }, order: { effectiveFrom: "DESC" } });
    return rows.map(toView);
  }

  /**
   * Publishes a new version, superseding whichever one is currently open —
   * same shape as `EmploymentService.upsert`, minus the per-staff
   * partitioning: there is only ever one global "current" row.
   */
  async upsert(dto: UpsertStatutoryRuleSetDto, actorUserId: string): Promise<StatutoryRuleSetView> {
    validateBands(dto);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StatutoryRuleSet);
      const open = await repo.findOne({ where: { effectiveTo: IsNull() } });

      if (open && dto.effectiveFrom <= open.effectiveFrom) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_EFFECTIVE_DATE",
          message: `The new rule set must take effect after ${open.effectiveFrom}, when the current version started.`,
        });
      }

      if (open) {
        open.effectiveTo = dayBefore(dto.effectiveFrom);
        await repo.save(open);
      }

      const created = await repo.save(
        repo.create({
          epfEmployeePercent: dto.epfEmployeePercent,
          epfEmployerPercent: dto.epfEmployerPercent,
          etfEmployerPercent: dto.etfEmployerPercent,
          apitMonthlyFreeThresholdCents: dto.apitMonthlyFreeThresholdCents,
          apitBands: dto.apitBands,
          verified: dto.verified ?? false,
          sourceNote: dto.sourceNote.trim(),
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: null,
          createdBy: actorUserId,
        }),
      );

      await this.audit.record(
        {
          tenantId: null,
          actorUserId,
          action: open ? "STATUTORY_RULE_SET_SUPERSEDED" : "STATUTORY_RULE_SET_PUBLISHED",
          entityType: "StatutoryRuleSet",
          entityId: created.id,
          metadata: {
            effectiveFrom: dto.effectiveFrom,
            verified: dto.verified ?? false,
            supersedes: open?.id ?? null,
          },
        },
        manager,
      );

      const reloaded = await manager.getRepository(StatutoryRuleSet).findOne({
        where: { id: created.id },
        relations: { createdByUser: true },
      });
      return toView(reloaded!);
    });
  }
}

/** Bands must be ascending, and only the last one may be open-ended. */
function validateBands(dto: UpsertStatutoryRuleSetDto): void {
  const bands = dto.apitBands;
  for (let i = 0; i < bands.length; i++) {
    const isLast = i === bands.length - 1;
    if (bands[i].uptoCents === null && !isLast) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Only the last APIT band may be open-ended (uptoCents: null).",
      });
    }
    if (!isLast && bands[i].uptoCents !== null && bands[i + 1].uptoCents !== null && bands[i].uptoCents! >= bands[i + 1].uptoCents!) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "APIT bands must be in strictly ascending order of uptoCents.",
      });
    }
  }
}

function toView(row: StatutoryRuleSet): StatutoryRuleSetView {
  return {
    id: row.id,
    epfEmployeePercent: row.epfEmployeePercent,
    epfEmployerPercent: row.epfEmployerPercent,
    etfEmployerPercent: row.etfEmployerPercent,
    apitMonthlyFreeThresholdCents: row.apitMonthlyFreeThresholdCents,
    apitBands: row.apitBands,
    verified: row.verified,
    sourceNote: row.sourceNote,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdByName: row.createdByUser?.name ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}
