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
  PaymentProviderName,
  PaymentStatus,
  RefundStatus,
  type PaymentMethod,
  type PaymentQueryDto,
  type PaymentType,
  type RecordPaymentDto,
  type RefundPaymentDto,
} from "@salon/shared";
import { Payment } from "../entities/payment.entity";
import { Refund } from "../entities/refund.entity";
import { Appointment } from "../entities/appointment.entity";
import type { Tenant } from "../entities/tenant.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
// AuditService/PaymentProviderResolver must stay VALUE imports: NestJS
// resolves constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentProviderResolver } from "./providers/resolve-payment-provider";

export interface RecordPaymentInput {
  amountCents: number;
  method: PaymentMethod;
  type: PaymentType;
  provider: PaymentProviderName;
  /** Null for customer-initiated online payments. */
  recordedById: string | null;
  idempotencyKey: string;
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
  ) {}

  /** POST /appointments/:id/payments — staff-recorded payment against an existing appointment. */
  async recordPaymentForAppointment(
    tenant: Tenant,
    appointmentId: string,
    dto: RecordPaymentDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const appointment = await manager
        .getRepository(Appointment)
        .findOne({ where: { id: appointmentId, tenantId: tenant.id } });
      if (!appointment) {
        throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Appointment not found." });
      }
      return this.recordPayment(manager, tenant, appointment, {
        amountCents: dto.amountCents,
        method: dto.method,
        type: dto.type,
        provider: PaymentProviderName.MANUAL,
        recordedById: actorUserId,
        idempotencyKey,
      });
    });
  }

  /**
   * The one place a `Payment` row is ever created — called here and from
   * `BookingService.confirmHold` (passed an already-open transaction
   * manager so the payment commits atomically with the appointment).
   * Mutates `appointment.advancePaidCents`/`balanceCents` in place and
   * persists them, so a caller already holding the `appointment` reference
   * (e.g. `confirmHold`'s response) sees the updated balance without a
   * second read.
   */
  async recordPayment(
    manager: EntityManager,
    tenant: Tenant,
    appointment: Appointment,
    input: RecordPaymentInput,
  ): Promise<Payment> {
    const paymentRepo = manager.getRepository(Payment);

    // Idempotent replay check FIRST — a retry of an already-successful
    // payment must return the cached result, not fail the balance check
    // below (the balance has already moved from the first attempt).
    const existingByKey = await paymentRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
    if (existingByKey) {
      return existingByKey;
    }

    if (input.amountCents > appointment.balanceCents) {
      throw new ApiError({
        statusCode: 400,
        code: "PAYMENT_EXCEEDS_BALANCE",
        message: `Amount exceeds the outstanding balance of ${appointment.balanceCents} cents.`,
      });
    }

    const provider = this.providers.resolve(input.provider);
    const { providerPaymentRef } = await provider.confirm({
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
    });

    let payment: Payment;
    try {
      payment = await paymentRepo.save(
        paymentRepo.create({
          tenantId: tenant.id,
          appointmentId: appointment.id,
          customerId: appointment.customerId,
          amountCents: input.amountCents,
          method: input.method,
          state: PaymentStatus.SUCCESS,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          provider: input.provider,
          providerPaymentRef,
          recordedById: input.recordedById,
          recordedAt: new Date(),
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await paymentRepo.findOne({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          return existing;
        }
      }
      throw err;
    }

    appointment.advancePaidCents += input.amountCents;
    appointment.balanceCents -= input.amountCents;
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
          amountCents: input.amountCents,
          method: input.method,
          type: input.type,
        },
      },
      manager,
    );

    return payment;
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
    const [data, total] = await this.payments.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }
}
