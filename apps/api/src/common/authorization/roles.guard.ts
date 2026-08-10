import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiError, UserRole } from "@salon/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedRequest } from "../../tenant/tenant-context";
import { PERMISSIONS_KEY } from "./permissions.decorator";
import type { Permission } from "./permission.enum";
import { ROLE_PERMISSIONS } from "./role-permissions";

/**
 * Third global guard in the chain: JwtAuthGuard -> TenantGuard -> RolesGuard.
 * Routes with no @Permissions metadata pass through unchanged (existing
 * behavior preserved). @Permissions(a, b) grants access if the caller holds
 * ANY of the listed permissions.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Missing bearer token.",
      });
    }

    // Tenant-scoped users: TenantGuard-verified membership roles. Platform
    // users with no tenant context (e.g. SUPER_ADMIN): fall back to the
    // roles carried on the verified JWT itself. Both sources are
    // server-derived — never client input.
    const rawRoles = req.tenantContext?.roles ?? req.user.roles ?? [];
    const roles = rawRoles.filter((r): r is UserRole =>
      Object.values(UserRole).includes(r as UserRole),
    );

    const granted = new Set<Permission>(
      roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []),
    );
    const allowed = required.some((permission) => granted.has(permission));

    if (!allowed) {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
      });
    }

    return true;
  }
}
