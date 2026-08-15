import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** POST /appointments/:id/cancel (API.md §3) — OWNER, MANAGER, RECEPTIONIST. */
export class CancelAppointmentDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** POST /bookings/:reference/cancel (API.md §2) — public, phone proves ownership. */
export class SelfServiceCancelDto {
  @IsString()
  phone!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** POST /appointments/:id/reschedule (API.md §3) — OWNER, MANAGER, RECEPTIONIST. */
export class RescheduleAppointmentDto {
  @IsDateString()
  newStart!: string;

  @IsOptional()
  @IsUUID("4")
  newStaffId?: string;
}

/** POST /bookings/:reference/reschedule (API.md §2) — public, phone proves ownership. */
export class SelfServiceRescheduleDto {
  @IsString()
  phone!: string;

  @IsDateString()
  newStart!: string;

  @IsOptional()
  @IsUUID("4")
  newStaffId?: string;
}

/** POST /appointments/:id/services (API.md §3) — OWNER, MANAGER, RECEPTIONIST, STAFF (own). */
export class AddAppointmentServiceDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  serviceIds!: string[];
}

/** DELETE /appointments/:id/services/:appointmentServiceId (API.md §3) — OWNER, MANAGER, RECEPTIONIST. */
export class RemoveAppointmentServiceDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
