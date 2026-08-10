import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/** List-endpoint pagination (API.md §1: `?limit=1..100&offset=0`, default limit 50). */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
