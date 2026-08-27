import { IsEnum, IsOptional, IsUUID, IsString, IsNumber, IsArray, ValidateNested, IsBoolean } from "class-validator";
import { Type } from "class-transformer";
import { NotificationStatus, NotificationEvent, NotificationChannel } from "../enums";
import { PaginationQueryDto } from "./common.dto";

/** GET /notifications (API.md §3) — OWNER, MANAGER, RECEPTIONIST. */
export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID("4")
  appointmentId?: string;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}

/** DTO for notification rule targeting criteria. */
export class TargetingDto {
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  staffIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerTags?: string[];

  @IsOptional()
  @IsNumber()
  minTotalAmount?: number;

  @IsOptional()
  @IsNumber()
  maxTotalAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bookingSources?: string[];

  @IsOptional()
  @IsBoolean()
  isNewCustomer?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  custom?: Record<string, unknown>;
}

/** DTO for notification rule timing configuration. */
export class TimingValueDto {
  @IsOptional()
  @IsNumber()
  offsetHours?: number;

  @IsOptional()
  @IsNumber()
  windowMinutes?: number;

  @IsOptional()
  @IsNumber()
  delayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  atBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  atCheckin?: boolean;
}

/** POST /notifications/rules — Create a notification rule. */
export class CreateNotificationRuleDto {
  @IsString()
  name: string;

  @IsEnum(NotificationEvent)
  eventType: NotificationEvent;

  @IsEnum(["BEFORE_APPT", "DAY_OF_APPT", "AFTER_BOOKING", "AFTER_COMPLETION"])
  timingType: "BEFORE_APPT" | "DAY_OF_APPT" | "AFTER_BOOKING" | "AFTER_COMPLETION";

  @ValidateNested()
  @Type(() => TimingValueDto)
  timingValue: TimingValueDto;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels: NotificationChannel[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TargetingDto)
  targeting?: TargetingDto;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  templateSubject?: string;

  @IsOptional()
  @IsString()
  templateBody?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/** PATCH /notifications/rules/:id — Update a notification rule. */
export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(["BEFORE_APPT", "DAY_OF_APPT", "AFTER_BOOKING", "AFTER_COMPLETION"])
  timingType?: "BEFORE_APPT" | "DAY_OF_APPT" | "AFTER_BOOKING" | "AFTER_COMPLETION";

  @IsOptional()
  @ValidateNested()
  @Type(() => TimingValueDto)
  timingValue?: TimingValueDto;

  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TargetingDto)
  targeting?: TargetingDto;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  templateSubject?: string;

  @IsOptional()
  @IsString()
  templateBody?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/** GET /notifications/rules — Query notification rules. */
export class NotificationRuleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationEvent)
  eventType?: NotificationEvent;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/** POST /notifications/templates — Create a notification template. */
export class CreateNotificationTemplateDto {
  @IsString()
  name: string;

  @IsEnum(NotificationEvent)
  eventType: NotificationEvent;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}

/** PATCH /notifications/templates/:id — Update a notification template. */
export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  /** Owner/Manager on/off switch for a predefined (system) template — off means it's never selected as a Rule's fallback. */
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/** POST /notifications/test — Test a notification. */
export class TestNotificationDto {
  @IsEnum(NotificationEvent)
  eventType: NotificationEvent;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels: NotificationChannel[];

  @IsOptional()
  @IsString()
  templateSubject?: string;

  @IsOptional()
  @IsString()
  templateBody?: string;

  @IsOptional()
  @IsUUID("4")
  appointmentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  mockData?: Record<string, unknown>;
}

/** GET /notifications/quota — Query quota. */
export class NotificationQuotaQueryDto {
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}

/** Customer notification preferences DTO. */
export class CustomerNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  bookingConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  reminders?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}

/**
 * PATCH /notifications/event-settings/:eventType — DECISIONS.md §40. A
 * per-tenant, per-event kill switch: "don't send Cancellation Confirmation
 * messages at all", independent of channel, Rule, or Template.
 */
export class UpdateNotificationEventSettingDto {
  @IsBoolean()
  isEnabled: boolean;
}

/** One row of GET /notifications/event-settings. */
export class NotificationEventSettingRecordDto {
  eventType: NotificationEvent;
  isEnabled: boolean;
}
