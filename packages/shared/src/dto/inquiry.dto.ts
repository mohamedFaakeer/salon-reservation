import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { BookingSource, InquiryStatus } from "../enums";
import { PaginationQueryDto } from "./common.dto";
import { CreateCustomerDto } from "./customer.dto";

/**
 * POST /inquiries — OWNER, MANAGER, RECEPTIONIST.
 *
 * Deliberately thin next to CreateAppointmentDto: no staff, no start, no
 * duration. Somebody asking what a bridal package costs has not chosen a
 * stylist or a time, and demanding either to record the question would make
 * the receptionist invent both.
 *
 * `serviceIds` is optional and may be empty for the same reason. "Do you do
 * balayage?" is a real inquiry about a service the salon may not even offer.
 */
export class CreateInquiryDto {
  @IsOptional()
  @IsUUID("4")
  customerId?: string;

  /**
   * Same either/or as CreateAppointmentDto: exactly one of `customerId` and
   * `newCustomer`, checked in the service layer where a cross-field rule is
   * cheaper to express than as a decorator.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  newCustomer?: CreateCustomerDto;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  serviceIds?: string[];

  /** How they asked. Reuses BookingSource — the channels are the same ones. */
  @IsIn([BookingSource.WALK_IN, BookingSource.PHONE, BookingSource.WHATSAPP])
  source!: BookingSource;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * PATCH /inquiries/:id — close it, reopen it, or record that it became a
 * booking.
 *
 * `appointmentId` is accepted only alongside CONVERTED, and the service
 * re-checks that the appointment belongs to the caller's salon. A client that
 * posts someone else's appointment id must not be able to link it here.
 */
export class UpdateInquiryDto {
  @IsIn([InquiryStatus.OPEN, InquiryStatus.CONVERTED, InquiryStatus.CLOSED])
  status!: InquiryStatus;

  @IsOptional()
  @IsUUID("4")
  appointmentId?: string;
}

/** GET /inquiries — filters. */
export class InquiryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn([InquiryStatus.OPEN, InquiryStatus.CONVERTED, InquiryStatus.CLOSED])
  status?: InquiryStatus;

  @IsOptional()
  @IsUUID("4")
  customerId?: string;
}
