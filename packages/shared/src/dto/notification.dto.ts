import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { NotificationStatus } from "../enums";
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
