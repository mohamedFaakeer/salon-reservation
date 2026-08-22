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
  GiftCardStatus,
  PaymentMethod,
  PaymentProviderName,
  PaymentStatus,
  PaymentType,
  type CreateGiftCardDto,
  type GiftCardQueryDto,
} from "@salon/shared";
import { GiftCard } from "../entities/gift-card.entity";
import { Payment } from "../entities/payment.entity";
import type { Tenant } from "../entities/tenant.entity";
import { colomboNow } from "../availability/time.util";
import { generateGiftCardCode, normalizeGiftCardCode } from "./gift-card-code.util";
import type { GiftCardView } from "./gift-card.types";
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
export class GiftCardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(GiftCard) private readonly giftCards: Repository<GiftCard>,
    private readonly customers: CustomerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The sale of the card itself. Idempotent on `idempotencyKey` the same way
   * an appointment payment is — a retried request returns the same card
   * rather than issuing a second one, found via the payment row's own
   * unique index rather than a second key on `gift_card`.
   */
  async create(
    tenant: Tenant,
    dto: CreateGiftCardDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<GiftCardView> {
    if (!SELLABLE_METHODS.includes(dto.paymentMethod)) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Choose cash, bank transfer or card for how this gift card was paid for.",
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const existingPayment = await paymentRepo.findOne({ where: { idempotencyKey } });
      if (existingPayment) {
        const existingCard = await manager
          .getRepository(GiftCard)
          .findOne({ where: { purchasePaymentId: existingPayment.id }, relations: { purchaserCustomer: true, issuedBy: true } });
        if (existingCard) {
          return this.toView(existingCard);
        }
      }

      const purchaser = await this.customers.findOrCreateForBooking(tenant.id, dto.purchaser, manager);

      const payment = await paymentRepo.save(
        paymentRepo.create({
          tenantId: tenant.id,
          appointmentId: null,
          customerId: purchaser.id,
          amountCents: dto.amountCents,
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
      const card = await manager.getRepository(GiftCard).save(
        manager.getRepository(GiftCard).create({
          tenantId: tenant.id,
          code,
          initialValueCents: dto.amountCents,
          remainingBalanceCents: dto.amountCents,
          currency: tenant.currency,
          purchaserCustomerId: purchaser.id,
          recipientName: dto.recipientName?.trim() || null,
          recipientPhone: dto.recipientPhone?.trim() || null,
          recipientEmail: dto.recipientEmail?.trim().toLowerCase() || null,
          message: dto.message?.trim() || null,
          expiresAt: dto.expiresAt,
          status: GiftCardStatus.ACTIVE,
          issuedById: actorUserId,
          purchasePaymentId: payment.id,
        }),
      );
      card.purchaserCustomer = purchaser;

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "GIFT_CARD_ISSUED",
          entityType: "GiftCard",
          entityId: card.id,
          metadata: { code: card.code, amountCents: card.initialValueCents, expiresAt: card.expiresAt },
        },
        manager,
      );

      return this.toView(card);
    });
  }

  async list(tenantId: string, query: GiftCardQueryDto): Promise<GiftCardView[]> {
    const qb = this.giftCards
      .createQueryBuilder("gc")
      .leftJoinAndSelect("gc.purchaserCustomer", "purchaser")
      .leftJoinAndSelect("gc.issuedBy", "issuedBy")
      .where("gc.tenantId = :tenantId", { tenantId })
      .orderBy("gc.issuedAt", "DESC")
      .take(query.limit)
      .skip(query.offset);
    if (query.q) {
      qb.andWhere(
        "(gc.code ILIKE :q OR purchaser.firstName ILIKE :q OR purchaser.lastName ILIKE :q OR purchaser.phone ILIKE :q)",
        { q: `%${query.q}%` },
      );
    }
    const rows = await qb.getMany();
    return rows.map((row) => this.toView(row));
  }

  async get(tenantId: string, id: string): Promise<GiftCardView> {
    return this.toView(await this.findOwned(tenantId, id));
  }

  /** PATCH /gift-cards/:id/void — mirrors IncentivePayoutService.void exactly: only "already void" blocks it. */
  async void(tenantId: string, id: string, actorUserId: string, reason: string): Promise<GiftCardView> {
    const card = await this.findOwned(tenantId, id);
    if (card.status === GiftCardStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "GIFT_CARD_ALREADY_VOID", message: "This gift card is already void." });
    }
    card.status = GiftCardStatus.VOID;
    card.voidedAt = new Date();
    card.voidedBy = actorUserId;
    card.voidReason = reason.trim();
    await this.giftCards.save(card);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "GIFT_CARD_VOIDED",
      entityType: "GiftCard",
      entityId: card.id,
      metadata: { code: card.code, remainingBalanceCents: card.remainingBalanceCents, reason: card.voidReason },
    });

    return this.get(tenantId, id);
  }

  /** A pure read — no lock, no mutation. Used by the public preview step before a customer commits. */
  async preview(tenantId: string, code: string): Promise<{ remainingBalanceCents: number; expiresAt: string }> {
    const card = await this.giftCards.findOne({ where: { tenantId, code: normalizeGiftCardCode(code) } });
    if (!card) {
      throw new ApiError({
        statusCode: 404,
        code: "GIFT_CARD_NOT_FOUND",
        message: "We couldn't find an active gift card with that code.",
      });
    }
    this.assertRedeemable(card, colomboNow(new Date()).date);
    return { remainingBalanceCents: card.remainingBalanceCents, expiresAt: card.expiresAt };
  }

  /**
   * Staff-recorded payment: the amount is fixed by whoever is charging it,
   * so the card must cover it exactly or the request is refused outright —
   * never silently short-applied. Runs inside the caller's own transaction.
   */
  async redeemExact(
    manager: EntityManager,
    tenantId: string,
    code: string,
    exactCents: number,
    context: RedeemContext,
  ): Promise<{ giftCardId: string }> {
    const card = await this.lockActiveCard(manager, tenantId, code);
    if (card.remainingBalanceCents < exactCents) {
      throw new ApiError({
        statusCode: 409,
        code: "GIFT_CARD_INSUFFICIENT_BALANCE",
        message: `This gift card has ${formatCents(card.remainingBalanceCents)} remaining — not enough to cover ${formatCents(exactCents)}.`,
      });
    }
    await this.debit(manager, card, exactCents, context);
    return { giftCardId: card.id };
  }

  /**
   * Online booking flow: applies as much of the card as covers the amount
   * due, never more — the server decides the real figure, the client only
   * ever supplies the code. Runs inside the caller's own transaction.
   */
  async redeemUpTo(
    manager: EntityManager,
    tenantId: string,
    code: string,
    maxCents: number,
    context: RedeemContext,
  ): Promise<{ giftCardId: string; appliedCents: number }> {
    const card = await this.lockActiveCard(manager, tenantId, code);
    const appliedCents = Math.min(card.remainingBalanceCents, maxCents);
    await this.debit(manager, card, appliedCents, context);
    return { giftCardId: card.id, appliedCents };
  }

  private async debit(manager: EntityManager, card: GiftCard, appliedCents: number, context: RedeemContext): Promise<void> {
    card.remainingBalanceCents -= appliedCents;
    if (card.remainingBalanceCents <= 0) {
      card.remainingBalanceCents = 0;
      card.status = GiftCardStatus.REDEEMED;
    }
    await manager.getRepository(GiftCard).save(card);

    await this.audit.record(
      {
        tenantId: card.tenantId,
        actorUserId: context.actorUserId,
        action: "GIFT_CARD_REDEEMED",
        entityType: "GiftCard",
        entityId: card.id,
        metadata: { appliedCents, appointmentId: context.appointmentId, remainingBalanceCents: card.remainingBalanceCents },
      },
      manager,
    );
  }

  private async lockActiveCard(manager: EntityManager, tenantId: string, code: string): Promise<GiftCard> {
    const card = await manager
      .getRepository(GiftCard)
      .createQueryBuilder("gc")
      .setLock("pessimistic_write")
      .where("gc.tenantId = :tenantId AND gc.code = :code", { tenantId, code: normalizeGiftCardCode(code) })
      .getOne();
    if (!card) {
      throw new ApiError({
        statusCode: 404,
        code: "GIFT_CARD_NOT_FOUND",
        message: "We couldn't find an active gift card with that code.",
      });
    }
    this.assertRedeemable(card, colomboNow(new Date()).date);
    return card;
  }

  private assertRedeemable(card: GiftCard, today: string): void {
    if (card.status === GiftCardStatus.VOID) {
      throw new ApiError({ statusCode: 409, code: "GIFT_CARD_VOID", message: "This gift card has been voided." });
    }
    if (card.status === GiftCardStatus.REDEEMED || card.remainingBalanceCents <= 0) {
      throw new ApiError({
        statusCode: 409,
        code: "GIFT_CARD_ALREADY_REDEEMED",
        message: "This gift card has already been fully redeemed.",
      });
    }
    if (card.expiresAt < today) {
      throw new ApiError({ statusCode: 410, code: "GIFT_CARD_EXPIRED", message: "This gift card has expired." });
    }
  }

  private async findOwned(tenantId: string, id: string): Promise<GiftCard> {
    const card = await this.giftCards.findOne({
      where: { tenantId, id },
      relations: { purchaserCustomer: true, issuedBy: true },
    });
    if (!card) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Gift card not found." });
    }
    return card;
  }

  private async generateUniqueCode(manager: EntityManager, tenantSlug: string): Promise<string> {
    const repo = manager.getRepository(GiftCard);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateGiftCardCode(tenantSlug);
      const exists = await repo.findOne({ where: { code: candidate } });
      if (!exists) {
        return candidate;
      }
    }
    throw new Error("Failed to generate a unique gift card code after 5 attempts.");
  }

  private toView(card: GiftCard): GiftCardView {
    const today = colomboNow(new Date()).date;
    return {
      id: card.id,
      code: card.code,
      initialValueCents: card.initialValueCents,
      remainingBalanceCents: card.remainingBalanceCents,
      currency: card.currency,
      purchaser: card.purchaserCustomer
        ? { name: `${card.purchaserCustomer.firstName} ${card.purchaserCustomer.lastName}`.trim(), phone: card.purchaserCustomer.phone }
        : null,
      recipientName: card.recipientName,
      recipientPhone: card.recipientPhone,
      recipientEmail: card.recipientEmail,
      message: card.message,
      expiresAt: card.expiresAt,
      expired: card.expiresAt < today,
      status: card.status,
      issuedByName: card.issuedBy?.name ?? null,
      issuedAt: card.issuedAt,
      voidedAt: card.voidedAt,
      voidReason: card.voidReason,
    };
  }
}

function formatCents(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
}
