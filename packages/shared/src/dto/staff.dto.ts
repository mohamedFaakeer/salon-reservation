import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/** Display only (locked product decision) — never used to filter or gate a booking. */
export const STAFF_GENDERS = ["MALE", "FEMALE"] as const;
export type StaffGender = (typeof STAFF_GENDERS)[number];

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

  /** e.g. "Senior Stylist", "Colour Specialist" — free text, shown publicly. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  jobTitle?: string;

  @IsOptional()
  @IsIn(STAFF_GENDERS)
  gender?: StaffGender;
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

  /** `null` unlinks the staff member from any login. */
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** The commission/incentive plan this stylist earns under. `null` unassigns. */
  @IsOptional()
  @IsUUID()
  incentivePlanId?: string | null;

  /** e.g. "Senior Stylist", "Colour Specialist" — free text, shown publicly. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  jobTitle?: string;

  /** `null` clears it — display only, never used to filter or gate a booking. */
  @IsOptional()
  @IsIn([...STAFF_GENDERS, null])
  gender?: StaffGender | null;
}
