import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { BookingSource } from "../enums";
import { PaginationQueryDto } from "./common.dto";
import { CreateCustomerDto } from "./customer.dto";

/**
 * POST /appointments (API.md §3) — OWNER, MANAGER, RECEPTIONIST.
 * Exactly one of `customerId`/`newCustomer` must be provided — validated in
 * the service layer (a cross-field either/or is more trouble than it's
 * worth as a decorator, matching this codebase's existing preference).
 */
export class CreateAppointmentDto {
  @IsOptional()
  @IsUUID("4")
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  newCustomer?: CreateCustomerDto;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  serviceIds!: string[];

  @IsUUID("4")
  staffId!: string;

  @IsDateString()
  start!: string;

  @IsIn([BookingSource.WALK_IN, BookingSource.PHONE, BookingSource.WHATSAPP])
  source!: BookingSource;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  checkInNow?: boolean;
}

/** GET /appointments — filters (API.md §3). */
export class AppointmentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsUUID("4")
  staffId?: string;

  @IsOptional()
  @IsUUID("4")
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
