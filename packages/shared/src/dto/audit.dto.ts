import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationQueryDto } from "./common.dto";

/** GET /audit?entityType&entityId&from&to (API.md §3) — OWNER, MANAGER only. */
export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
