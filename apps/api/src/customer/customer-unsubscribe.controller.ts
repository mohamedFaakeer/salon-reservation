import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
// CustomerService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "./customer.service";

/**
 * DECISIONS.md §43 — the public, no-login unsubscribe link carried in
 * marketing/win-back messages (`{{unsubscribeUrl}}`). Same shape as
 * `BookingController`'s self-service routes: a whole controller marked
 * `@Public()` rather than fighting `CustomerController`'s class-level
 * `@Permissions` guard for one route. Shares the `customers` path prefix
 * with `CustomerController` without colliding — no route on that
 * controller matches `GET|POST /customers/:id/unsubscribe`.
 */
@ApiTags("customers")
@Controller("customers")
@Public()
export class CustomerUnsubscribeController {
  constructor(private readonly customers: CustomerService) {}

  @Get(":id/unsubscribe")
  getUnsubscribeInfo(@Param("id") id: string) {
    return this.customers.getUnsubscribeInfo(id);
  }

  @Post(":id/unsubscribe")
  @HttpCode(200)
  unsubscribe(@Param("id") id: string) {
    return this.customers.unsubscribeFromMarketing(id);
  }
}
