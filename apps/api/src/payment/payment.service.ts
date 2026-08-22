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
  NotificationEvent,
  PaymentMethod,
  PaymentProviderName,
  PaymentStatus,
  RefundStatus,
  type PaymentQueryDto,
  type PaymentType,
  type RecordPaymentDto,
  type RefundPaymentDto,
} from "@salon/shared";
import { Payment } from "../entities/payment.entity";
import { Refund } from "../entities/refund.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import type { Tenant } from "../entities/tenant.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
// AuditService/PaymentProviderResolver/NotificationService must stay VALUE
// imports: NestJS resolves constructor injection via design:paramtypes
// metadata at runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentProviderResolver } from "./providers/resolve-payment-provider";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "../notification/notification.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GiftCardService } from "../gift-card/gift-card.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ServicePackageService } from "../service-package/service-package.service";

export interface RecordPaymentInput {
  amountCents: number;
  method: PaymentMethod;
  type: PaymentType;
  provider: PaymentProviderName;
  /** Null for customer-initiated online payments. */
  recordedById: string | null;
  idempotencyKey: string;
  /**
   * Already-resolved (the caller — e.g. `BookingService.confirmHold` — has
   * already redeemed the card via `GiftCardService.redeemUpTo`). Takes
   * precedence over `giftCardCode`: when set, no redemption happens here,
   * the id is only stamped onto the created row.
   */
  giftCardId?: string | null;
  /** Set when `method` is GIFT_CARD and the caller hasn't already redeemed it (the staff-recorded path). */
  giftCardCode?: string;
  /** Same idea as `giftCardId` — already-resolved by the caller (`BookingService.confirmHold`). */
  packageRedemptionId?: string | null;
  /** Set when `method` is PACKAGE_CREDIT and the caller hasn't already redeemed it (the staff-recorded path). */
  packageCode?: string;
}

export interface PaymentListResult {
  data: Payment[];
  meta: { total: number; limit: number; offset: number };
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly providers: PaymentProviderResolver,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly giftCards: GiftCardService,
    private readonly servicePackages: ServicePackageService,
  ) {}

  /** POST /appointments/:id/payments — staff-recorded payment against an existing appointment. */
  async recordPaymentForAppointment(
    tenant: Tenant,
    appointmentId: string,
    dto: RecordPaymentDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<Payment> {
    const { payment, appointment, isNew } = await this.dataSource.transaction(async (manager) => {
      const foundAppointment = await manager
        .getRepository(Appointment)
        .findOne({ where: { id: appointmentId, tenantId: tenant.id }, relations: { customer: true } });
      if (!foundAppointment) {
        throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Appointment not found." });
      }
      const recorded = await this.recordPaymentInternal(manager, tenant, foundAppointment, {
        amountCents: dto.amountCents,
        method: dto.method,
        type: dto.type,
        provider: PaymentProviderName.MANUAL,
        recordedById: actorUserId,
        idempotencyKey,
        giftCardCode: dto.giftCardCode,
        packageCode: dto.packageCode,
      });
      return { ...recorded, appointment: foundAppointment };
    });

    // Idempotent retries must not re-fire a notification.
    if (isNew) {
      try {
        await this.notifications.fire(tenant, NotificationEvent.PAYMENT_CONFIRMATION, appointment, appointment.customer);
      } catch {
        // Notification failure must never surface as an error to the caller (PRD §3.10).
      }
    }

    return payment;
  }

  /**
   * The one place a `Payment` row is ever created — called here and from
   * `BookingService.confirmHold` (passed an already-open transaction
   * manager so the payment commits atomically with the appointment).
   * Mutates `appointment.advancePaidCents`/`balanceCents` in place and
   * persists them, so a caller already holding the `appointment` reference
   * (e.g. `confirmHold`'s response) sees the updated balance without a
   * second read. Thin wrapper around `recordPaymentInternal` for callers
   * (like `confirmHold`) that don't need to distinguish a fresh record from
   * an idempotent replay.
   */
  async recordPayment(
    manager: EntityManager,
    tenant: Tenant,
    appointment: Appointment,
    input: RecordPaymentInput,
  ): Promise<Payment> {
    const { payment } = await this.recordPaymentInternal(manager, tenant, appointment, input);
    return payment;
  }

  private async recordPaymentInternal(
    manager: EntityManager,
    tenant: Tenant,
    appointment: Appointment,
    input: RecordPaymentInput,
  ): Promise<{ payment: Payment; isNew: boolean }> {
    const paymentRepo = manager.getRepository(Payment);

    // Idempotent replay check FIRST — a retry of an already-successful
    // payment must return the cached result, not fail the balance check
    // below (the balance has already moved from the first attempt).
    const existingByKey = await paymentRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
    if (existingByKey) {
      return { payment: existingByKey, isNew: false };
    }

    if (input.amountCents > appointment.balanceCents) {
      throw new ApiError({
        statusCode: 400,
        code: "PAYMENT_EXCEEDS_BALANCE",
        message: `Amount exceeds the outstanding balance of ${appointment.balanceCents} cents.`,
      });
    }

    // Redeemed only after the balance check passes — a request that would
    // overcharge the appointment must never touch the card's balance.
    // `giftCardId` already set means the caller (BookingService.confirmHold)
    // redeemed it themselves via `redeemUpTo` before calling here; only the
    // staff-recorded path resolves it from a raw code, and only for the
    // exact amount requested.
    let giftCardId = input.giftCardId ?? null;
    if (input.method === PaymentMethod.GIFT_CARD && !giftCardId) {
      if (!input.giftCardCode) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "A gift card code is required for this payment method.",
        });
      }
      const redeemed = await this.giftCards.redeemExact(manager, tenant.id, input.giftCardCode, input.amountCents, {
        actorUserId: input.recordedById,
        appointmentId: appointment.id,
      });
      giftCardId = redeemed.giftCardId;
    }

    // `finalAmountCents` may end up lower than `input.amountCents` — a
    // package's `redeemOne` applies `min(unitPriceCentsSnapshot, maxCents)`,
    // never a fungible balance, so what gets recorded on the row can be less
    // than what was requested (never more). The staff-recorded path resolves
    // that here; the booking flow (`BookingService.confirmHold`) already
    // resolved it itself and passes the applied figure as `input.amountCents`
    // directly, with `packageRedemptionId` pre-set.
    let packageRedemptionId = input.packageRedemptionId ?? null;
    let finalAmountCents = input.amountCents;
    if (input.method === PaymentMethod.PACKAGE_CREDIT && !packageRedemptionId) {
      if (!input.packageCode) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "A package code is required for this payment method.",
        });
      }
      const activeLines = await manager
        .getRepository(AppointmentServiceLine)
        .find({ where: { appointmentId: appointment.id, status: "ACTIVE" } });
      const eligibleServiceIds = activeLines
        .map((l) => l.serviceId)
        .filter((id): id is string => Boolean(id));
      const redeemed = await this.servicePackages.redeemOne(
        manager,
        tenant.id,
        input.packageCode,
        eligibleServiceIds,
        input.amountCents,
        { actorUserId: input.recordedById, appointmentId: appointment.id },
      );
      packageRedemptionId = redeemed.packageId;
      finalAmountCents = redeemed.appliedCents;
    }

    const provider = this.providers.resolve(input.provider);
    const { providerPaymentRef } = await provider.confirm({
      amountCents: finalAmountCents,
      idempotencyKey: input.idempotencyKey,
    });

    let payment: Payment;
    try {
      payment = await paymentRepo.save(
        paymentRepo.create({
          tenantId: tenant.id,
          appointmentId: appointment.id,
          customerId: appointment.customerId,
          amountCents: finalAmountCents,
          method: input.method,
          state: PaymentStatus.SUCCESS,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          provider: input.provider,
          providerPaymentRef,
          recordedById: input.recordedById,
          recordedAt: new Date(),
          giftCardId,
          packageRedemptionId,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await paymentRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          return { payment: existing, isNew: false };
        }
      }
      throw err;
    }

    appointment.advancePaidCents += finalAmountCents;
    appointment.balanceCents -= finalAmountCents;
    await manager.getRepository(Appointment).save(appointment);

    await this.audit.record(
      {
        tenantId: tenant.id,
        actorUserId: input.recordedById,
        action: "PAYMENT_RECORDED",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          appointmentId: appointment.id,
          amountCents: finalAmountCents,
          method: input.method,
          type: input.type,
        },
      },
      manager,
    );

    return { payment, isNew: true };
  }

  /** POST /payments/:id/refund — manual entry point; opens its own transaction. */
  async refund(tenant: Tenant, paymentId: string, dto: RefundPaymentDto, actorUserId: string | null): Promise<Refund> {
    return this.dataSource.transaction((manager) => this.refundWithManager(manager, tenant, paymentId, dto, actorUserId));
  }

  /**
   * The one place a `Refund` row is ever created. Takes an externally-owned
   * manager so `BookingService.cancelAppointment`/`markNoShow` can call this
   * atomically within their own transaction (the refund must commit or roll
   * back together with the appointment's status change) — same pattern as
   * `recordPayment` vs. `recordPaymentForAppointment`. Refunds recorded here
   * are still manual/record-only (P13); the *amount* passed in may now come
   * from `RefundCalculator` (P14) instead of a human-entered figure.
   */
  async refundWithManager(
    manager: EntityManager,
    tenant: Tenant,
    paymentId: string,
    dto: RefundPaymentDto,
    actorUserId: string | null,
  ): Promise<Refund> {
    const paymentRepo = manager.getRepository(Payment);
    const refundRepo = manager.getRepository(Refund);

    const payment = await paymentRepo.findOne({ where: { id: paymentId, tenantId: tenant.id } });
    if (!payment) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Payment not found." });
    }

    const priorRefunds = await refundRepo.find({ where: { paymentId } });
    const alreadyRefunded = priorRefunds.reduce((sum, r) => sum + r.amountCents, 0);
    const refundable = payment.amountCents - alreadyRefunded;
    if (dto.amountCents > refundable) {
      throw new ApiError({
        statusCode: 400,
        code: "REFUND_EXCEEDS_PAYMENT",
        message: `Amount exceeds the refundable balance of ${refundable} cents.`,
      });
    }

    const provider = this.providers.resolve(payment.provider);
    const { providerRef } = await provider.refund({
      amountCents: dto.amountCents,
      providerPaymentRef: payment.providerPaymentRef,
    });

    const refund = await refundRepo.save(
      refundRepo.create({
        paymentId,
        amountCents: dto.amountCents,
        reason: dto.reason,
        state: RefundStatus.SUCCEEDED,
        providerRef,
        initiatedById: actorUserId,
      }),
    );

    const totalRefunded = alreadyRefunded + dto.amountCents;
    payment.state = totalRefunded >= payment.amountCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
    await paymentRepo.save(payment);

    if (payment.appointmentId) {
      const appointmentRepo = manager.getRepository(Appointment);
      const appointment = await appointmentRepo.findOne({ where: { id: payment.appointmentId } });
      if (appointment) {
        appointment.balanceCents += dto.amountCents;
        appointment.advancePaidCents -= dto.amountCents;
        await appointmentRepo.save(appointment);
      }
    }

    await this.audit.record(
      {
        tenantId: tenant.id,
        actorUserId,
        action: "PAYMENT_REFUNDED",
        entityType: "Refund",
        entityId: refund.id,
        metadata: { paymentId, amountCents: dto.amountCents, reason: dto.reason },
      },
      manager,
    );

    return refund;
  }

  async list(tenantId: string, query: PaymentQueryDto): Promise<PaymentListResult> {
    const where: Record<string, unknown> = { tenantId };
    if (query.appointmentId) {
      where.appointmentId = query.appointmentId;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.state) {
      where.state = query.state;
    }
    if (query.giftCardId) {
      where.giftCardId = query.giftCardId;
    }
    if (query.packageRedemptionId) {
      where.packageRedemptionId = query.packageRedemptionId;
    }
    const [data, total] = await this.payments.findAndCount({
      where,
      // A payment row on its own is an amount with no owner. The list screen
      // has to say who paid and against which booking, so the names are loaded
      // here rather than left to one lookup per row on the client.
      relations: { customer: true, appointment: true },
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }
}
