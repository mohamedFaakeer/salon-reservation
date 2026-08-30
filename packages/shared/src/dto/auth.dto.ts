import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

/**
 * Refresh token is normally carried by the httpOnly cookie. It may also be
 * sent in the body for cross-origin clients (web/admin apps) that cannot rely
 * on SameSite=Strict cookies.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  refreshToken?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  refreshToken?: string;
}

/**
 * POST /auth/complete-first-login — redeems the forced-first-login
 * "set a new password" challenge `login()` returns instead of a real
 * session when the current password was set by someone else (account
 * creation, or an OWNER/MANAGER/SUPER_ADMIN reset).
 */
export class CompleteFirstLoginDto {
  @IsString()
  @MinLength(16)
  changeToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}