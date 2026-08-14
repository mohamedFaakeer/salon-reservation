import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfirmPaymentDto, CreateBookingDto } from "@salon/shared";
import { ApiError } from "@salon/shared";
import { Public } from "../common/decorators/public.decorator";
// TenantService/BookingService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BookingService } from "./booking.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public Booking (API.md §2) — no auth; tenant resolved from the slug. */
@Controller()
@Public()
export class BookingController {
  constructor(
    private readonly bookings: BookingService,
    private readonly tenantService: TenantService,
  ) {}

  @Post("salons/:slug/bookings")
  async createBooking(
    @Param("slug") slug: string,
    @Body() dto: CreateBookingDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const sessionKey = requireIdempotencyKey(idempotencyKey);
    const tenant = await this.tenantService.findActiveBySlug(slug);
    const result = await this.bookings.reserve(tenant, dto, sessionKey);
    return {
      bookingReference: result.bookingReference,
      holdExpiresAt: result.expiresAt,
      paymentIntent: { id: result.holdId, amountCents: result.amountCents, status: "PENDING" },
    };
  }

  @Post("payments/:intentId/confirm")
  @HttpCode(200)
  async confirm(
    @Param("intentId") intentId: string,
    @Body() _dto: ConfirmPaymentDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const sessionKey = requireIdempotencyKey(idempotencyKey);
    const tenant = await this.resolveTenantForHold(intentId);
    const { appointment, bookingReference } = await this.bookings.confirmHold(tenant, intentId, sessionKey);
    return { appointment, bookingReference };
  }

  @Post("payments/:intentId/cancel")
  @HttpCode(200)
  async cancel(@Param("intentId") intentId: string) {
    const tenant = await this.resolveTenantForHold(intentId);
    await this.bookings.cancelHold(tenant, intentId);
    return { ok: true };
  }

  @Get("bookings/:reference")
  async findByReference(@Param("reference") reference: string, @Query("phone") phone?: string) {
    if (!phone) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "phone is required." });
    }
    // No :slug in this route (API.md) — bookingReference is globally
    // unique, so no tenant scoping is needed to find it; `phone` proves
    // ownership instead.
    return this.bookings.findByReferenceAndPhone(reference, phone);
  }

  /**
   * `POST /payments/:intentId/confirm|cancel` don't carry the salon slug —
   * only the public availability/booking endpoints do. The hold id alone
   * is globally unique (uuid), so the tenant is derived from the hold row
   * itself rather than requiring the client to resend the slug.
   */
  private async resolveTenantForHold(holdId: string) {
    const tenantId = await this.bookings.resolveTenantIdForHold(holdId);
    return this.tenantService.findById(tenantId);
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !UUID_RE.test(value)) {
    throw new ApiError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "A valid Idempotency-Key header (UUID) is required.",
    });
  }
  return value;
}
