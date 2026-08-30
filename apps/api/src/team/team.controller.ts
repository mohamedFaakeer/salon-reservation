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
 * Staff logins for one salon. Hiring, role changes, and enable/disable stay
 * OWNER-only via the class-level MANAGE_TEAM default — those are not a
 * manager's decision to make. `list` and `reset-password` are the two
 * routes MANAGER also reaches, via the narrower RESET_TEAM_MEMBER_PASSWORD
 * permission (account-lockout-v2, DECISIONS.md): seeing who's locked, and
 * clearing it, without being able to restructure the team.
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

  /**
   * OWNER (full team management) or MANAGER (needs to see who's locked, to
   * know whom to reset — `RESET_TEAM_MEMBER_PASSWORD` alone would otherwise
   * leave MANAGER with an action but no list to use it from).
   */
  @Get()
  @Permissions(Permission.MANAGE_TEAM, Permission.RESET_TEAM_MEMBER_PASSWORD)
  list(@Req() req: AuthenticatedRequest) {
    const ctx = getTenantContext(req);
    return this.team.list(ctx.tenantId);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTeamMemberDto) {
    const ctx = getTenantContext(req);
    return this.team.create(ctx.tenantId, dto, req.user.sub, ctx.limits ?? null);
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

  /**
   * OWNER + MANAGER (via `RESET_TEAM_MEMBER_PASSWORD`, narrower than the
   * class-level `MANAGE_TEAM`) — resets a colleague's password, which also
   * clears any lockout. Method-level `@Permissions` overrides the class
   * default (NestJS `Reflector.getAllAndOverride`), same technique `list()`
   * uses just above.
   */
  @Post(":userId/reset-password")
  @Permissions(Permission.RESET_TEAM_MEMBER_PASSWORD)
  resetPassword(@Req() req: AuthenticatedRequest, @Param("userId", ParseUUIDPipe) userId: string) {
    const ctx = getTenantContext(req);
    return this.team.resetPassword(ctx.tenantId, userId, req.user.sub);
  }
}
