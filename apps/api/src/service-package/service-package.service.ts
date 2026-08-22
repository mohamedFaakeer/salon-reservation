import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import {
  ApiError,
  PaymentMethod,
  PaymentProviderName,
  PaymentStatus,
  PaymentType,
  ServicePackageStatus,
  type CreateServicePackageDto,
  type ServicePackageQueryDto,
} from "@salon/shared";
import { ServicePackage } from "../entities/service-package.entity";
import { Payment } from "../entities/payment.entity";
import { Service } from "../entities/service.entity";
import type { Tenant } from "../entities/tenant.entity";
import { colomboNow } from "../availability/time.util";
import { generateServicePackageCode, normalizeServicePackageCode } from "./service-package-code.util";
import type { ServicePackageView } from "./service-package.types";
// CustomerService/AuditService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime; `import
// type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "../customer/customer.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

const SELLABLE_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD_CAPTURED,
];

export interface RedeemContext {
  actorUserId: string | null;
  appointmentId: string;
}

@Injectable()
export class ServicePackageService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ServicePackage) private readonly packages: Repository<ServicePackage>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    private readonly customers: CustomerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The sale of the package itself. Idempotent on `idempotencyKey`, same
   * pattern as `GiftCardService.create` — a retried request returns the same
   * package rather than issuing a second one, found via the payment row's
   * own unique index rather than a second key on `service_package`.
   */
  async create(
    tenant: Tenant,
    dto: CreateServicePackageDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<ServicePackageView> {
    if (!SELLABLE_METHODS.includes(dto.paymentMethod)) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Choose cash, bank transfer or card for how this package was paid for.",
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const existingPayment = await paymentRepo.findOne({ where: { idempotencyKey } });
      if (existingPayment) {
        const existingPackage = await manager
          .getRepository(ServicePackage)
          .findOne({ where: { purchasePaymentId: existingPayment.id }, relations: { customer: true, issuedBy: true } });
        if (existingPackage) {
          return this.toView(existingPackage);
        }
      }

      const service = await this.services.findOne({ where: { id: dto.serviceId, tenantId: tenant.id, active: true } });
      if (!service) {
        throw new ApiError({ statusCode: 404, code: "SERVICE_NOT_FOUND", message: "That service does not exist." });
      }

      const customer = await this.customers.findOrCreateForBooking(tenant.id, dto.customer, manager);

      const payment = await paymentRepo.save(
        paymentRepo.create({
          tenantId: tenant.id,
          appointmentId: null,
          customerId: customer.id,
          amountCents: dto.purchasePriceCents,
          method: dto.paymentMethod,
          state: PaymentStatus.SUCCESS,
          type: PaymentType.FULL,
          idempotencyKey,
          provider: PaymentProviderName.MANUAL,
          providerPaymentRef: null,
          recordedById: actorUserId,
          recordedAt: new Date(),
        }),
      );

      const code = await this.generateUniqueCode(manager, tenant.slug);
      const servicePackage = await manager.getRepository(ServicePackage).save(
        manager.getRepository(ServicePackage).create({
          tenantId: tenant.id,
          code,
          customerId: customer.id,
          serviceId: service.id,
          serviceNameSnapshot: service.name,
          unitPriceCentsSnapshot: service.priceCents,
          totalUses: dto.totalUses,
          remainingUses: dto.totalUses,
          purchasePriceCents: dto.purchasePriceCents,
          expiresAt: dto.expiresAt,
          status: ServicePackageStatus.ACTIVE,
          issuedById: actorUserId,
          purchasePaymentId: payment.id,
        }),
      );
      servicePackage.customer = customer;

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "SERVICE_PACKAGE_ISSUED",
          entityType: "ServicePackage",
          entityId: servicePackage.id,
          metadata: {
            code: servicePackage.code,
            serviceId: service.id,
            totalUses: servicePackage.totalUses,
            purchasePriceCents: servicePackage.purchasePriceCents,
            expiresAt: servicePackage.expiresAt,
          },
        },
        manager,
      );

      return this.toView(servicePackage);
    });
  }

  async list(tenantId: string, query: ServicePackageQueryDto): Promise<ServicePackageView[]> {
    const qb = this.packages
      .createQueryBuilder("sp")
      .leftJoinAndSelect("sp.customer", "customer")
      .leftJoinAndSelect("sp.issuedBy", "issuedBy")
      .where("sp.tenantId = :tenantId", { tenantId })
      .orderBy("sp.issuedAt", "DESC")
      .take(query.limit)
      .skip(query.offset);
    if (query.q) {
      qb.andWhere(
        "(sp.code ILIKE :q OR customer.firstName ILIKE :q OR customer.lastName ILIKE :q OR customer.phone ILIKE :q)",
        { q: `%${query.q}%` },
      );
    }
    const rows = await qb.getMany();
    return rows.map((row) => this.toView(row));
  }

  async get(tenantId: string, id: string): Promise<ServicePackageView> {
    return this.toView(await this.findOwned(tenantId, id));
  }

  /** PATCH /service-packages/:id/void — mirrors GiftCardService.void exactly: only "already void" blocks it. */
  async void(tenantId: string, id: string, actorUserId: string, reason: string): Promise<ServicePackageView> {
    const servicePackage = await this.findOwned(tenantId, id);
    if (servicePackage.status === ServicePackageStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "SERVICE_PACKAGE_ALREADY_VOID", message: "This package is already void." });
    }
    servicePackage.status = ServicePackageStatus.VOID;
    servicePackage.voidedAt = new Date();
    servicePackage.voidedBy = actorUserId;
    servicePackage.voidReason = reason.trim();
    await this.packages.save(servicePackage);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "SERVICE_PACKAGE_VOIDED",
      entityType: "ServicePackage",
      entityId: servicePackage.id,
      metadata: { code: servicePackage.code, remainingUses: servicePackage.remainingUses, reason: servicePackage.voidReason },
    });

    return this.get(tenantId, id);
  }

  /** A pure read — no lock, no mutation. Used by the public preview step before a customer commits. */
  async preview(
    tenantId: string,
    code: string,
  ): Promise<{ remainingUses: number; unitPriceCentsSnapshot: number; serviceId: string; serviceNameSnapshot: string; expiresAt: string }> {
    const servicePackage = await this.packages.findOne({ where: { tenantId, code: normalizeServicePackageCode(code) } });
    if (!servicePackage) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_PACKAGE_NOT_FOUND",
        message: "We couldn't find an active package with that code.",
      });
    }
    this.assertRedeemable(servicePackage, colomboNow(new Date()).date);
    return {
      remainingUses: servicePackage.remainingUses,
      unitPriceCentsSnapshot: servicePackage.unitPriceCentsSnapshot,
      serviceId: servicePackage.serviceId,
      serviceNameSnapshot: servicePackage.serviceNameSnapshot,
      expiresAt: servicePackage.expiresAt,
    };
  }

  /**
   * The one redemption method, used by both the desk (`maxCents` = what
   * staff is charging) and online booking (`maxCents` = the advance still
   * due) — a package use is inherently all-or-one, not a fungible cents
   * balance, so there is no exact-vs-up-to split the way gift cards have.
   * `eligibleServiceIds` is every service actually being paid for on this
   * appointment/booking; the package's own `serviceId` must be among them or
   * the redemption is refused outright. Runs inside the caller's own
   * transaction.
   */
  async redeemOne(
    manager: EntityManager,
    tenantId: string,
    code: string,
    eligibleServiceIds: string[],
    maxCents: number,
    context: RedeemContext,
  ): Promise<{ packageId: string; appliedCents: number }> {
    const servicePackage = await this.lockActivePackage(manager, tenantId, code);
    if (!eligibleServiceIds.includes(servicePackage.serviceId)) {
      throw new ApiError({
        statusCode: 409,
        code: "PACKAGE_SERVICE_MISMATCH",
        message: `This package is for ${servicePackage.serviceNameSnapshot} visits — it can't be used for what's being booked.`,
      });
    }

    const appliedCents = Math.min(servicePackage.unitPriceCentsSnapshot, maxCents);

    servicePackage.remainingUses -= 1;
    if (servicePackage.remainingUses <= 0) {
      servicePackage.remainingUses = 0;
      servicePackage.status = ServicePackageStatus.DEPLETED;
    }
    await manager.getRepository(ServicePackage).save(servicePackage);

    await this.audit.record(
      {
        tenantId: servicePackage.tenantId,
        actorUserId: context.actorUserId,
        action: "SERVICE_PACKAGE_REDEEMED",
        entityType: "ServicePackage",
        entityId: servicePackage.id,
        metadata: {
          appliedCents,
          appointmentId: context.appointmentId,
          remainingUses: servicePackage.remainingUses,
        },
      },
      manager,
    );

    return { packageId: servicePackage.id, appliedCents };
  }

  private async lockActivePackage(manager: EntityManager, tenantId: string, code: string): Promise<ServicePackage> {
    const servicePackage = await manager
      .getRepository(ServicePackage)
      .createQueryBuilder("sp")
      .setLock("pessimistic_write")
      .where("sp.tenantId = :tenantId AND sp.code = :code", { tenantId, code: normalizeServicePackageCode(code) })
      .getOne();
    if (!servicePackage) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_PACKAGE_NOT_FOUND",
        message: "We couldn't find an active package with that code.",
      });
    }
    this.assertRedeemable(servicePackage, colomboNow(new Date()).date);
    return servicePackage;
  }

  private assertRedeemable(servicePackage: ServicePackage, today: string): void {
    if (servicePackage.status === ServicePackageStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "SERVICE_PACKAGE_VOID", message: "This package has been voided." });
    }
    if (servicePackage.status === ServicePackageStatus.DEPLETED || servicePackage.remainingUses <= 0) {
      throw new ApiError({
        statusCode: 409,
        code: "SERVICE_PACKAGE_DEPLETED",
        message: "This package has no uses left.",
      });
    }
    if (servicePackage.expiresAt < today) {
      throw new ApiError({ statusCode: 410, code: "SERVICE_PACKAGE_EXPIRED", message: "This package has expired." });
    }
  }

  private async findOwned(tenantId: string, id: string): Promise<ServicePackage> {
    const servicePackage = await this.packages.findOne({
      where: { tenantId, id },
      relations: { customer: true, issuedBy: true },
    });
    if (!servicePackage) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Package not found." });
    }
    return servicePackage;
  }

  private async generateUniqueCode(manager: EntityManager, tenantSlug: string): Promise<string> {
    const repo = manager.getRepository(ServicePackage);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateServicePackageCode(tenantSlug);
      const exists = await repo.findOne({ where: { code: candidate } });
      if (!exists) {
        return candidate;
      }
    }
    throw new Error("Failed to generate a unique package code after 5 attempts.");
  }

  private toView(servicePackage: ServicePackage): ServicePackageView {
    const today = colomboNow(new Date()).date;
    return {
      id: servicePackage.id,
      code: servicePackage.code,
      customer: servicePackage.customer
        ? { name: `${servicePackage.customer.firstName} ${servicePackage.customer.lastName}`.trim(), phone: servicePackage.customer.phone }
        : null,
      serviceId: servicePackage.serviceId,
      serviceNameSnapshot: servicePackage.serviceNameSnapshot,
      unitPriceCentsSnapshot: servicePackage.unitPriceCentsSnapshot,
      totalUses: servicePackage.totalUses,
      remainingUses: servicePackage.remainingUses,
      purchasePriceCents: servicePackage.purchasePriceCents,
      expiresAt: servicePackage.expiresAt,
      expired: servicePackage.expiresAt < today,
      status: servicePackage.status,
      issuedByName: servicePackage.issuedBy?.name ?? null,
      issuedAt: servicePackage.issuedAt,
      voidedAt: servicePackage.voidedAt,
      voidReason: servicePackage.voidReason,
    };
  }
}
