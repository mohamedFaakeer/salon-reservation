import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, type CreateServiceDto, type UpdateServiceDto } from "@salon/shared";
import { Service } from "../entities/service.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface ServiceUpdateActor {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service) private readonly services: Repository<Service>,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateServiceDto): Promise<Service> {
    return this.services.save(
      this.services.create({
        tenantId,
        branchId: null,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        category: dto.category?.trim() ?? null,
        durationMin: dto.durationMin,
        priceCents: dto.priceCents,
        active: true,
      }),
    );
  }

  async list(tenantId: string): Promise<Service[]> {
    return this.services.find({ where: { tenantId }, order: { name: "ASC" } });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateServiceDto,
    actor: ServiceUpdateActor,
  ): Promise<Service> {
    const service = await this.services.findOne({ where: { id, tenantId } });
    if (!service) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
        message: "Service not found.",
      });
    }

    const priceCentsBefore = service.priceCents;
    const durationMinBefore = service.durationMin;

    if (dto.name !== undefined) service.name = dto.name.trim();
    if (dto.description !== undefined) service.description = dto.description.trim();
    if (dto.category !== undefined) service.category = dto.category.trim();
    if (dto.durationMin !== undefined) service.durationMin = dto.durationMin;
    if (dto.priceCents !== undefined) service.priceCents = dto.priceCents;
    if (dto.active !== undefined) service.active = dto.active;

    const saved = await this.services.save(service);

    const metadata: Record<string, unknown> = {};
    if (dto.priceCents !== undefined && dto.priceCents !== priceCentsBefore) {
      metadata.priceCentsBefore = priceCentsBefore;
      metadata.priceCentsAfter = dto.priceCents;
    }
    if (dto.durationMin !== undefined && dto.durationMin !== durationMinBefore) {
      metadata.durationMinBefore = durationMinBefore;
      metadata.durationMinAfter = dto.durationMin;
    }

    if (Object.keys(metadata).length > 0) {
      await this.audit.record({
        tenantId,
        actorUserId: actor.userId,
        action: "SERVICE_PRICE_CHANGED",
        entityType: "Service",
        entityId: id,
        metadata,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      });
    }

    return saved;
  }
}
