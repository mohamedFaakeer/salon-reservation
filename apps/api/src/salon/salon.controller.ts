import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
// SalonService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SalonService } from "./salon.service";

/** Public Salon Discovery (API.md §2) — no auth. */
@Controller("salons")
@Public()
export class SalonController {
  constructor(private readonly salons: SalonService) {}

  @Get()
  list(@Query("q") q?: string) {
    return this.salons.list(q);
  }

  @Get(":slug")
  profile(@Param("slug") slug: string) {
    return this.salons.profile(slug);
  }
}
