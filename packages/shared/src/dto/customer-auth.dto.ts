import { Equals, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * POST /customer-auth/signup — a platform-level account, not tied to any one
 * salon (DECISIONS.md). Phone is re-validated/normalized server-side via
 * `normalizeSriLankanPhone`; this only bounds the raw string.
 */
export class CustomerSignupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  /** Must be explicitly `true` — a checkbox left unticked fails validation, not just a truthiness check. */
  @Equals(true)
  termsAccepted!: boolean;
}

/** POST /customer-auth/login — phone + password, for a returning customer on a new device. */
export class CustomerLoginDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

/** POST /customer-auth/otp/send — rate-limited per phone (SECURITY.md); an SMS costs real money. */
export class SendPhoneOtpDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;
}

/** POST /customer-auth/otp/verify. */
export class VerifyPhoneOtpDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;
}

/** Mirrors `RefreshTokenDto`/`LogoutDto` (auth.dto.ts): body-based, since a cross-origin SameSite cookie won't reach apps/web anyway. */
export class CustomerRefreshTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  refreshToken?: string;
}

export class CustomerLogoutDto {
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  refreshToken?: string;
}
