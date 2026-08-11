import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/** POST /staff (API.md §3) — OWNER, MANAGER only. */
export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialties?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: "color must be a hex code, e.g. #4F46E5" })
  color?: string;

  /** Links to an existing user (staff may or may not have login). */
  @IsOptional()
  @IsUUID()
  userId?: string;
}

/** PATCH /staff/:id — all fields optional (PATCH semantics). */
export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialties?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: "color must be a hex code, e.g. #4F46E5" })
  color?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
