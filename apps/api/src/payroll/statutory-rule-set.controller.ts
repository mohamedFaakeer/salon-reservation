import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// UpsertStatutoryRuleSetDto must stay a VALUE import: ValidationPipe
// resolves it via design:paramtypes metadata at runtime; `import type`
// would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpsertStatutoryRuleSetDto } from "@salon/shared";
import type { AuthenticatedRequest } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// StatutoryRuleSetService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StatutoryRuleSetService } from "./statutory-rule-set.service";

/**
 * Global EPF/ETF/APIT rates — platform-wide, not tenant-scoped. SUPER_ADMIN
 * only: these are facts about Sri Lankan law, not a salon's own policy.
 * No `@RequiresModule` here — this route has no tenant context at all.
 */
@ApiTags("super-admin")
@ApiBearerAuth()
@Controller("super-admin/statutory-rule-sets")
export class StatutoryRuleSetController {
  constructor(private readonly ruleSets: StatutoryRuleSetService) {}

  @Get()
  @Permissions(Permission.PLATFORM_ADMIN)
  history() {
    return this.ruleSets.history();
  }

  @Get("current")
  @Permissions(Permission.PLATFORM_ADMIN)
  current() {
    return this.ruleSets.current();
  }

  @Post()
  @Permissions(Permission.PLATFORM_ADMIN)
  publish(@Req() req: AuthenticatedRequest, @Body() dto: UpsertStatutoryRuleSetDto) {
    return this.ruleSets.upsert(dto, req.user.sub);
  }
}
