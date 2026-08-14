import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentQueryDto, RecordPaymentDto, RefundPaymentDto } from "@salon/shared";
import { ApiError } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
// TenantService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaymentService } from "./payment.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** API.md §3 "Payments". */
@ApiTags("payments")
@ApiBearerAuth()
@Controller()
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly tenantService: TenantService,
  ) {}

  @Post("appointments/:id/payments")
  @Permissions(Permission.RECORD_PAYMENT)
  async record(
    @Req() req: Request,
    @Param("id") appointmentId: string,
    @Body() dto: RecordPaymentDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ctx = getTenantContext(req);
    const key = requireIdempotencyKey(idempotencyKey);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.payments.recordPaymentForAppointment(tenant, appointmentId, dto, ctx.userId, key);
  }

  @Get("payments")
  @Permissions(Permission.RECORD_PAYMENT, Permission.ISSUE_REFUND)
  async list(@Req() req: Request, @Query() query: PaymentQueryDto) {
    const ctx = getTenantContext(req);
    return this.payments.list(ctx.tenantId, query);
  }

  @Post("payments/:id/refund")
  @HttpCode(200)
  @Permissions(Permission.ISSUE_REFUND)
  async refund(@Req() req: Request, @Param("id") paymentId: string, @Body() dto: RefundPaymentDto) {
    const ctx = getTenantContext(req);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.payments.refund(tenant, paymentId, dto, ctx.userId);
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
