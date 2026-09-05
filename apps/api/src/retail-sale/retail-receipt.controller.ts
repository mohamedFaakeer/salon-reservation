import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiError } from "@salon/shared";
import { Public } from "../common/decorators/public.decorator";
// RetailSaleService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RetailSaleService } from "./retail-sale.service";

/**
 * The page a "Share" button texts to a customer — no login. `id` alone is
 * not treated as a credential: the customer's own phone (typed on the page,
 * the same `/bookings/:reference?phone=` pattern `BookingController` uses)
 * proves ownership too. Its own controller rather than a route on
 * `RetailSaleController`, which is staff-authenticated and gated by the
 * `inventory` module for the whole class.
 */
@ApiTags("retail-sale-receipts")
@Controller("retail-sale-receipts")
@Public()
export class RetailReceiptController {
  constructor(private readonly retailSales: RetailSaleService) {}

  @Get(":id")
  get(@Param("id") id: string, @Query("phone") phone?: string) {
    if (!phone) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "phone is required." });
    }
    return this.retailSales.getPublicReceipt(id, phone);
  }
}
