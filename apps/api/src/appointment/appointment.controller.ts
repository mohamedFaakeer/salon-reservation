import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AddAppointmentServiceDto,
  AppointmentQueryDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  RemoveAppointmentServiceDto,
  SetAppointmentDiscountDto,
  RescheduleAppointmentDto,
} from "@salon/shared";
import { ApiError } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// AppointmentService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AppointmentService } from "./appointment.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** API.md §3 "Appointments". */
@ApiTags("appointments")
@ApiBearerAuth()
@Controller("appointments")
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Post()
  @Permissions(Permission.MANAGE_APPOINTMENTS)
  create(
    @Req() req: Request,
    @Body() dto: CreateAppointmentDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ctx = getTenantContext(req);
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "A valid Idempotency-Key header (UUID) is required.",
      });
    }
    return this.appointments.create(ctx.tenantId, dto, ctx.userId, idempotencyKey);
  }

  @Get()
  @Permissions(Permission.MANAGE_APPOINTMENTS, Permission.MANAGE_OWN_APPOINTMENT)
  list(@Req() req: Request, @Query() query: AppointmentQueryDto) {
    const ctx = getTenantContext(req);
    return this.appointments.list(ctx.tenantId, query, ctx);
  }

  @Get(":id")
  @Permissions(Permission.MANAGE_APPOINTMENTS, Permission.MANAGE_OWN_APPOINTMENT)
  findOne(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.appointments.findOne(ctx.tenantId, id, ctx);
  }

  @Post(":id/check-in")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS)
  checkIn(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.appointments.checkIn(ctx.tenantId, id);
  }

  @Post(":id/in-service")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS, Permission.MANAGE_OWN_APPOINTMENT)
  inService(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.appointments.inService(ctx.tenantId, id, ctx);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS, Permission.MANAGE_OWN_APPOINTMENT)
  complete(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.appointments.complete(ctx.tenantId, id, ctx);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS)
  cancel(@Req() req: Request, @Param("id") id: string, @Body() dto: CancelAppointmentDto) {
    const ctx = getTenantContext(req);
    return this.appointments.cancel(ctx.tenantId, id, dto, ctx.userId);
  }

  @Post(":id/reschedule")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS)
  reschedule(@Req() req: Request, @Param("id") id: string, @Body() dto: RescheduleAppointmentDto) {
    const ctx = getTenantContext(req);
    return this.appointments.reschedule(ctx.tenantId, id, dto, ctx.userId);
  }

  @Post(":id/services")
  @Permissions(Permission.MANAGE_APPOINTMENTS, Permission.MANAGE_OWN_APPOINTMENT)
  addService(@Req() req: Request, @Param("id") id: string, @Body() dto: AddAppointmentServiceDto) {
    const ctx = getTenantContext(req);
    return this.appointments.addService(ctx.tenantId, id, dto, ctx.userId, ctx);
  }

  /**
   * Guarded by RECORD_PAYMENT, not MANAGE_APPOINTMENTS: discounting is part of
   * settling a bill. Whether the caller may exceed the salon's cap is worked
   * out server-side from their roles.
   */
  @Patch(":id/discount")
  @Permissions(Permission.RECORD_PAYMENT)
  setDiscount(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: SetAppointmentDiscountDto,
  ) {
    const ctx = getTenantContext(req);
    return this.appointments.setDiscount(ctx.tenantId, id, dto, ctx);
  }

  @Delete(":id/services/:appointmentServiceId")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS)
  removeService(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("appointmentServiceId") appointmentServiceId: string,
    @Body() dto: RemoveAppointmentServiceDto,
  ) {
    const ctx = getTenantContext(req);
    return this.appointments.removeService(ctx.tenantId, id, appointmentServiceId, dto, ctx.userId);
  }

  @Post(":id/no-show")
  @HttpCode(200)
  @Permissions(Permission.MANAGE_APPOINTMENTS)
  noShow(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.appointments.noShow(ctx.tenantId, id, ctx.userId);
  }
}
