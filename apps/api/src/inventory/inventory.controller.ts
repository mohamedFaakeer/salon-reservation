import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateStockAdjustmentDto, CreateStockReceiptDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// Services must stay VALUE imports: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StockReceiptService } from "./stock-receipt.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { InventoryAdjustmentService } from "./inventory-adjustment.service";

/** Receiving stock and manual corrections — the "back office" half, MANAGE_INVENTORY only (OWNER, MANAGER). */
@ApiTags("inventory")
@ApiBearerAuth()
@Controller("inventory")
@Permissions(Permission.MANAGE_INVENTORY)
@RequiresModule("inventory")
export class InventoryController {
  constructor(
    private readonly receipts: StockReceiptService,
    private readonly adjustments: InventoryAdjustmentService,
  ) {}

  @Post("receipts")
  receive(@Req() req: Request, @Body() dto: CreateStockReceiptDto) {
    const ctx = getTenantContext(req);
    return this.receipts.receive(ctx.tenantId, dto, ctx.userId);
  }

  @Post("adjustments")
  adjust(@Req() req: Request, @Body() dto: CreateStockAdjustmentDto) {
    const ctx = getTenantContext(req);
    return this.adjustments.adjust(ctx.tenantId, dto, ctx.userId);
  }
}
