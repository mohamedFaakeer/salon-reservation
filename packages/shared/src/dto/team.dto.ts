import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "../enums";

/**
 * Roles an owner may hand out. Deliberately not the whole UserRole enum:
 * SUPER_ADMIN is a platform role that no salon may grant, and OWNER is not
 * self-service — a second owner is a change of who controls the business, not
 * a staffing decision.
 */
export const ASSIGNABLE_ROLES = [
  UserRole.MANAGER,
  UserRole.RECEPTIONIST,
  UserRole.STAFF,
] as const;

export class CreateTeamMemberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  role!: (typeof ASSIGNABLE_ROLES)[number];

  /** Links the login to an existing stylist so their own schedule resolves. */
  @IsOptional()
  @IsString()
  staffId?: string;
}

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  role?: (typeof ASSIGNABLE_ROLES)[number];

  /** DISABLED rather than deleted: the audit trail references this user. */
  @IsOptional()
  @IsIn(["ACTIVE", "DISABLED"])
  status?: "ACTIVE" | "DISABLED";
}
