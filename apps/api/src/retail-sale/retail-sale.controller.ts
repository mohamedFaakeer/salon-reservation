import { Body, Controller, Get, Headers, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiError } from "@salon/shared";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateRetailReturnDto, RetailSaleCheckoutDto, RetailSaleQueryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// TenantService/RetailSaleService/RetailReturnService must stay VALUE
// imports: NestJS resolves constructor injection via design:paramtypes
// metadata at runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RetailSaleService } from "./retail-sale.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RetailReturnService } from "./retail-return.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quick Sale checkout. Deliberately gated by RECORD_PAYMENT, not
 * MANAGE_INVENTORY — ringing up a cart is an ordinary payment-taking action
 * open to RECEPTIONIST, the same split gift cards and service packages
 * already use between issuing stored value and redeeming it.
 */
@ApiTags("retail-sales")
@ApiBearerAuth()
@Controller("retail-sales")
@RequiresModule("inventory")
export class RetailSaleController {
  constructor(
    private readonly retailSales: RetailSaleService,
    private readonly retailReturns: RetailReturnService,
    private readonly tenantService: TenantService,
  ) {}

  @Post("checkout")
  @Permissions(Permission.RECORD_PAYMENT)
  async checkout(
    @Req() req: Request,
    @Body() dto: RetailSaleCheckoutDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ctx = getTenantContext(req);
    const key = requireIdempotencyKey(idempotencyKey);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.retailSales.checkout(tenant, dto, ctx.userId, key);
  }

  @Get()
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  list(@Req() req: Request, @Query() query: RetailSaleQueryDto) {
    const ctx = getTenantContext(req);
    return this.retailSales.list(ctx.tenantId, query);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.retailSales.get(ctx.tenantId, id);
  }

  /**
   * Restock/quarantine, per line, against a completed sale — the same
   * ISSUE_REFUND gate an appointment cancellation refund already uses,
   * since a return can move real money back out.
   */
  @Post(":saleId/returns")
  @Permissions(Permission.ISSUE_REFUND)
  async processReturn(@Req() req: Request, @Param("saleId") saleId: string, @Body() dto: CreateRetailReturnDto) {
    const ctx = getTenantContext(req);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.retailReturns.process(tenant, saleId, dto, ctx.userId);
  }

  @Get(":saleId/returns")
  @Permissions(Permission.MANAGE_INVENTORY, Permission.RECORD_PAYMENT)
  listReturns(@Req() req: Request, @Param("saleId") saleId: string) {
    const ctx = getTenantContext(req);
    return this.retailReturns.listForSale(ctx.tenantId, saleId);
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
