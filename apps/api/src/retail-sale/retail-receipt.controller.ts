import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
// RetailSaleService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RetailSaleService } from "./retail-sale.service";

/**
 * The page a "Share" button texts to a customer — no login, `id` is the only
 * credential (a UUID, same unguessable-token pattern as everywhere else in
 * this app that hands out a link rather than an account). Its own controller
 * rather than a route on `RetailSaleController`, which is staff-authenticated
 * and gated by the `inventory` module for the whole class.
 */
@ApiTags("retail-sale-receipts")
@Controller("retail-sale-receipts")
@Public()
export class RetailReceiptController {
  constructor(private readonly retailSales: RetailSaleService) {}

  @Get(":id")
  get(@Param("id") id: string) {
    return this.retailSales.getPublicReceipt(id);
  }
}
