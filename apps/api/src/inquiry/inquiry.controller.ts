import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateInquiryDto, InquiryQueryDto, UpdateInquiryDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// InquiryService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { InquiryService } from "./inquiry.service";

/**
 * Inquiries — the same audience as appointments (OWNER, MANAGER,
 * RECEPTIONIST). Reuses MANAGE_APPOINTMENTS rather than inventing a
 * permission: anyone who may take a booking may take the question that
 * precedes it, and a separate capability would have exactly the same holders.
 */
@ApiTags("inquiries")
@ApiBearerAuth()
@Controller("inquiries")
@Permissions(Permission.MANAGE_APPOINTMENTS)
export class InquiryController {
  constructor(private readonly inquiries: InquiryService) {}

  @Get()
  list(@Req() req: Request, @Query() query: InquiryQueryDto) {
    const ctx = getTenantContext(req);
    return this.inquiries.list(ctx.tenantId, query);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateInquiryDto) {
    const ctx = getTenantContext(req);
    return this.inquiries.create(ctx.tenantId, dto, ctx.userId);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateInquiryDto) {
    const ctx = getTenantContext(req);
    return this.inquiries.update(ctx.tenantId, id, dto, ctx.userId);
  }
}
