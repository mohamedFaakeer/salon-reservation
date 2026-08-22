import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTO must stay a VALUE import: ValidationPipe resolves it via
// design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SendWinbackCampaignDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
import { RequiresModule } from "../common/authorization/module.decorator";
// TenantService/WinbackService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime; `import
// type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { WinbackService } from "./winback.service";

/**
 * Turning the "Worth a call" report into an action. Same gate as the report
 * it reads from (Reports entitlement + VIEW_REPORTS's OWNER/MANAGER scope,
 * via SEND_MARKETING_CAMPAIGN) — a Lite-tier salon can't reach this by
 * calling the endpoint directly any more than it can see the locked panel.
 */
@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports/lapsed-customers")
@Permissions(Permission.SEND_MARKETING_CAMPAIGN)
@RequiresModule("reports")
export class WinbackController {
  constructor(
    private readonly winback: WinbackService,
    private readonly tenantService: TenantService,
  ) {}

  @Post("winback")
  async send(@Req() req: Request, @Body() dto: SendWinbackCampaignDto) {
    const ctx = getTenantContext(req);
    const tenant = await this.tenantService.findById(ctx.tenantId);
    return this.winback.send(tenant, dto, ctx.userId);
  }
}
