import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SendInvoiceDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { InvoiceService } from "./invoice.service";

/**
 * Invoices — guarded by RECORD_PAYMENT, the same people who settle bills.
 * OWNER, MANAGER and RECEPTIONIST; a stylist has no business emailing one.
 */
@ApiTags("invoices")
@ApiBearerAuth()
@Controller()
@Permissions(Permission.RECORD_PAYMENT)
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  /** Every version for one appointment, newest first. */
  @Get("appointments/:appointmentId/invoices")
  listForAppointment(@Req() req: Request, @Param("appointmentId") appointmentId: string) {
    const ctx = getTenantContext(req);
    return this.invoices.listForAppointment(ctx.tenantId, appointmentId);
  }

  /**
   * Issue, or supersede the live one if the bill has moved. Safe to call
   * twice: an unchanged bill returns the existing invoice rather than burning
   * a second number on the same visit.
   */
  @Post("appointments/:appointmentId/invoices")
  issue(@Req() req: Request, @Param("appointmentId") appointmentId: string) {
    const ctx = getTenantContext(req);
    return this.invoices.issueFor(ctx.tenantId, appointmentId, ctx.userId);
  }

  @Get("invoices/:id")
  findOne(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.invoices.findOne(ctx.tenantId, id);
  }

  @Post("invoices/:id/send")
  send(@Req() req: Request, @Param("id") id: string, @Body() dto: SendInvoiceDto) {
    const ctx = getTenantContext(req);
    return this.invoices.send(ctx.tenantId, id, dto.email, ctx.userId);
  }
}
