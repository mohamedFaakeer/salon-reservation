import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateTeamMemberDto, UpdateTeamMemberDto } from "@salon/shared";
import type { AuthenticatedRequest } from "../tenant/tenant-context";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TeamService } from "./team.service";

/**
 * Staff logins for one salon. OWNER only, via MANAGE_TEAM — every route here
 * hands out or revokes access, which is not a manager's decision to make.
 *
 * tenantId always comes from the authenticated session, never the body, so an
 * owner of one salon cannot create a login in another.
 */
@ApiTags("team")
@ApiBearerAuth()
@Controller("team")
@Permissions(Permission.MANAGE_TEAM)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    const ctx = getTenantContext(req);
    return this.team.list(ctx.tenantId);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTeamMemberDto) {
    const ctx = getTenantContext(req);
    return this.team.create(ctx.tenantId, dto, req.user.sub);
  }

  @Patch(":userId")
  update(
    @Req() req: AuthenticatedRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    const ctx = getTenantContext(req);
    return this.team.update(ctx.tenantId, userId, dto, req.user.sub);
  }
}
