import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PaginationQueryDto } from "./common.dto";

/** POST /customers (API.md §3) and the inline `customer` object on bookings. */
export class CreateCustomerDto {
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

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}

/** GET /customers?q= — search by name/phone. */
export class CustomerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

/** PATCH /customers/:id (API.md §3) — currently just the marketing flag; not a general customer edit. */
export class UpdateCustomerDto {
  @IsOptional()
  @IsBoolean()
  marketingOptOut?: boolean;
}
