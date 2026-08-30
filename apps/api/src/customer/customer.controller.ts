import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  ApiError,
  CreateCustomerDto,
  CustomerPhoneLookupQueryDto,
  CustomerQueryDto,
  UpdateCustomerDto,
} from "@salon/shared";
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

  /** Powers the Add/Edit customer drawer's live duplicate-phone check — declared before `:id` so it isn't swallowed by that route. */
  @Get("lookup")
  lookup(@Req() req: Request, @Query() query: CustomerPhoneLookupQueryDto) {
    const ctx = getTenantContext(req);
    return this.customers.lookupByPhone(ctx.tenantId, query.phone);
  }

  /** Counts per segment for the Customers page's quick-filter chip badges — declared before `:id` for the same routing reason as `lookup`. */
  @Get("segments/summary")
  segmentsSummary(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.customers.segmentCounts(ctx.tenantId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCustomerDto) {
    const ctx = getTenantContext(req);
    return this.customers.create(ctx.tenantId, dto);
  }

  @Get(":id")
  findOne(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.customers.findDetail(ctx.tenantId, id);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    const ctx = getTenantContext(req);
    return this.customers.update(ctx.tenantId, id, dto, ctx.userId);
  }

  /**
   * A hard multer ceiling well above the real 2MB limit — just a backstop
   * against an enormous upload occupying memory before it's even read.
   * `CustomerService.uploadPhoto` runs the real, precisely-coded constraints
   * (magic-byte format check, size, dimensions, aspect ratio).
   */
  @Post(":id/photo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5_000_000 } }))
  uploadPhoto(@Req() req: Request, @Param("id") id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    const ctx = getTenantContext(req);
    if (!file) {
      throw new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message: "No file was uploaded." });
    }
    return this.customers.uploadPhoto(ctx.tenantId, id, file.buffer);
  }

  @Delete(":id/photo")
  removePhoto(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.customers.removePhoto(ctx.tenantId, id);
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
