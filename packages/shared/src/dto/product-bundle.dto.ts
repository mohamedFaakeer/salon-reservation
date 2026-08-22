import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PaginationQueryDto } from "./common.dto";

export class BundleComponentInputDto {
  @IsUUID("4")
  variantId!: string;

  @IsInt()
  @Min(1)
  quantityPerBundle!: number;
}

/**
 * POST /product-bundles — a kit sold as one line ("Gift Set" = shampoo +
 * conditioner). Deliberately no `quantityOnHand` of its own: availability is
 * always computed live from its components' current stock, so a bundle can
 * never desync from what it's actually made of.
 */
export class CreateProductBundleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BundleComponentInputDto)
  components!: BundleComponentInputDto[];
}

/** PATCH /product-bundles/:id — bundle-level fields only; components change via their own sub-routes. */
export class UpdateProductBundleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AddBundleComponentDto {
  @IsUUID("4")
  variantId!: string;

  @IsInt()
  @Min(1)
  quantityPerBundle!: number;
}

export class UpdateBundleComponentDto {
  @IsInt()
  @Min(1)
  quantityPerBundle!: number;
}

/** GET /product-bundles — filters. */
export class ProductBundleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeInactive?: boolean;
}
