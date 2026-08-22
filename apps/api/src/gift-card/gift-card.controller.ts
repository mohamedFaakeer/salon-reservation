import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiError } from "@salon/shared";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateGiftCardDto, GiftCardQueryDto, VoidGiftCardDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// TenantService/GiftCardService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GiftCardService } from "./gift-card.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gift cards (API.md) — creating/voiding is OWNER, MANAGER only. */
@ApiTags("gift-cards")
@ApiBearerAuth()
@Controller("gift-cards")
export class GiftCardController {
  constructor(
    private readonly giftCards: GiftCardService,
    private readonly tenantService: TenantService,
  ) {}

  @Post()
  @Permissions(Permission.MANAGE_GIFT_CARDS)
  async create(
    @Req() req: Request,
    @Body() dto: CreateGiftCardDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ctx = getTenantContext(req);
    const key = requireIdempotencyKey(idempotencyKey);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.giftCards.create(tenant, dto, ctx.userId, key);
  }

  @Get()
  @Permissions(Permission.MANAGE_GIFT_CARDS)
  list(@Req() req: Request, @Query() query: GiftCardQueryDto) {
    const ctx = getTenantContext(req);
    return this.giftCards.list(ctx.tenantId, query);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_GIFT_CARDS)
  get(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.giftCards.get(ctx.tenantId, id);
  }

  @Patch(":id/void")
  @Permissions(Permission.MANAGE_GIFT_CARDS)
  void(@Req() req: Request, @Param("id") id: string, @Body() dto: VoidGiftCardDto) {
    const ctx = getTenantContext(req);
    return this.giftCards.void(ctx.tenantId, id, ctx.userId, dto.reason);
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
