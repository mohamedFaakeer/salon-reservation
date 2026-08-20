import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateCustomerDto, CustomerQueryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// CustomerService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "./customer.service";

/** API.md §3 "Customers" — OWNER, MANAGER, RECEPTIONIST only. */
@ApiTags("customers")
@ApiBearerAuth()
@Controller("customers")
@Permissions(Permission.MANAGE_CUSTOMERS)
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  search(@Req() req: Request, @Query() query: CustomerQueryDto) {
    const ctx = getTenantContext(req);
    return this.customers.search(ctx.tenantId, query);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCustomerDto) {
    const ctx = getTenantContext(req);
    return this.customers.create(ctx.tenantId, dto);
  }

  @Get(":id")
  findOne(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.customers.findById(ctx.tenantId, id);
  }

  /**
   * Aggregated history for one customer: visits, spend, reliability and the
   * services they actually book. Computed in the database — a client tallying
   * a page of results reports "0 no-shows" for someone with three on page two.
   */
  @Get(":id/stats")
  stats(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.customers.stats(ctx.tenantId, id);
  }
}
