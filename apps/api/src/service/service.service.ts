import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, Repository } from "typeorm";
import {
  ApiError,
  DiscountType,
  type CreateServiceDto,
  type SetServiceDiscountDto,
  type UpdateServiceDto,
} from "@salon/shared";
import { Service } from "../entities/service.entity";
import { ServiceDiscount, ServiceDiscountWindow } from "../entities/service-discount.entity";
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
    @InjectRepository(ServiceDiscount) private readonly discounts: Repository<ServiceDiscount>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
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
    // The offer travels with the service everywhere it is listed: the admin
    // table, the booking drawer and the customer site all have to show the
    // same price, and a second fetch is a second chance to disagree.
    return this.services.find({
      where: { tenantId },
      relations: { discount: { windows: true } },
      order: { name: "ASC" },
    });
  }

  /**
   * PUT /services/:id/discount - replace the offer wholesale.
   *
   * Replace rather than patch: a discount is one coherent thing - amount,
   * dates and hours together - and partial updates invite states like "20%
   * off, dates cleared" that mean nothing. The old windows go with it.
   *
   * Nothing here touches appointments already booked. Their price and their
   * discount were snapshotted at booking (rule 5), so changing an offer today
   * cannot rewrite what somebody was quoted last week.
   */
  async setDiscount(
    tenantId: string,
    serviceId: string,
    dto: SetServiceDiscountDto,
    actor: ServiceUpdateActor,
  ): Promise<Service> {
    const service = await this.services.findOne({ where: { id: serviceId, tenantId } });
    if (!service) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
        message: "Service not found.",
      });
    }

    this.assertSaneDiscount(dto, service.priceCents);

    await this.dataSource.transaction(async (manager) => {
      const discountRepo = manager.getRepository(ServiceDiscount);
      const windowRepo = manager.getRepository(ServiceDiscountWindow);

      const existing = await discountRepo.findOne({ where: { serviceId } });
      if (existing) {
        await windowRepo.delete({ discountId: existing.id });
      }

      const saved = await discountRepo.save(
        discountRepo.create({
          ...(existing ? { id: existing.id } : {}),
          tenantId,
          serviceId,
          type: dto.type,
          value: dto.value,
          startDate: dto.startDate,
          endDate: dto.endDate,
          label: dto.label?.trim() || null,
          active: true,
        }),
      );

      if (dto.windows?.length) {
        await windowRepo.save(
          dto.windows.map((w) =>
            windowRepo.create({
              discountId: saved.id,
              dayOfWeek: w.dayOfWeek,
              startMin: w.startMin,
              endMin: w.endMin,
            }),
          ),
        );
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: actor.userId,
          action: "SERVICE_DISCOUNT_SET",
          entityType: "Service",
          entityId: serviceId,
          metadata: {
            type: dto.type,
            value: dto.value,
            startDate: dto.startDate,
            endDate: dto.endDate,
            windows: dto.windows?.length ?? 0,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });

    return this.findOneWithDiscount(tenantId, serviceId);
  }

  /** DELETE /services/:id/discount - the offer ends; bookings keep theirs. */
  async removeDiscount(
    tenantId: string,
    serviceId: string,
    actor: ServiceUpdateActor,
  ): Promise<Service> {
    const discount = await this.discounts.findOne({ where: { serviceId, tenantId } });
    if (!discount) {
      throw new ApiError({
        statusCode: 404,
        code: "DISCOUNT_NOT_FOUND",
        message: "That service has no discount to remove.",
      });
    }

    // Hard-deleted, unlike business records: an offer is configuration, not
    // history. What it did to real bookings is already snapshotted on them.
    await this.discounts.delete({ id: discount.id });

    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: "SERVICE_DISCOUNT_REMOVED",
      entityType: "Service",
      entityId: serviceId,
      metadata: { type: discount.type, value: discount.value },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return this.findOneWithDiscount(tenantId, serviceId);
  }

  private async findOneWithDiscount(tenantId: string, id: string): Promise<Service> {
    return this.services.findOneOrFail({
      where: { id, tenantId },
      relations: { discount: { windows: true } },
    });
  }

  /**
   * The database caps a percentage at 100 and a line discount at its own
   * price. These are the checks it cannot make: "LKR 3,000 off a LKR 2,000
   * service" is only wrong once you know the service, and saying so now beats
   * letting every booking silently clamp to free.
   */
  private assertSaneDiscount(dto: SetServiceDiscountDto, priceCents: number): void {
    if (dto.endDate < dto.startDate) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_DATE_RANGE",
        message: "The offer's end date must be on or after its start date.",
      });
    }
    if (dto.type === DiscountType.PERCENT && dto.value > 100) {
      throw new ApiError({
        statusCode: 400,
        code: "DISCOUNT_TOO_LARGE",
        message: "A percentage discount cannot exceed 100%.",
      });
    }
    if (dto.type === DiscountType.FIXED && dto.value > priceCents) {
      throw new ApiError({
        statusCode: 400,
        code: "DISCOUNT_TOO_LARGE",
        message: "The discount is more than the service costs.",
      });
    }
    for (const w of dto.windows ?? []) {
      if (w.endMin <= w.startMin) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_TIME_RANGE",
          message: "An offer window must end after it starts.",
        });
      }
    }
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
