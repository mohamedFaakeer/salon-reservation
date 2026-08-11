import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
// DTOs must stay VALUE imports: NestJS ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AvailabilityQueryDto } from "@salon/shared";
import { Public } from "../common/decorators/public.decorator";
import type { AvailabilitySlot } from "./availability.service";
// AvailabilityService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AvailabilityService } from "./availability.service";

/** Public Salon Discovery (API.md) — no auth; tenant resolved from the slug. */
@Controller("salons/:slug")
@Public()
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Post("availability")
  @HttpCode(200)
  findSlots(
    @Param("slug") slug: string,
    @Body() dto: AvailabilityQueryDto,
  ): Promise<{ slots: AvailabilitySlot[] }> {
    return this.availability.findSlots(slug, dto);
  }
}
