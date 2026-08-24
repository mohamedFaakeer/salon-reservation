import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiError, type ModuleKey } from "@salon/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedRequest } from "../../tenant/tenant-context";
import { MODULE_KEY } from "./module.decorator";

const MODULE_LABELS: Record<ModuleKey, string> = {
  attendance: "Attendance",
  incentives: "Incentives",
  reports: "Reports",
  auditLog: "The audit log",
  invoices: "Invoices",
  inventory: "Retail inventory",
  notifications: "Notifications",
};

/**
 * Fourth link in the guard chain (JwtAuthGuard -> TenantGuard -> RolesGuard ->
 * ModuleGuard, all `APP_GUARD`, in module-import order). Runs after
 * `RolesGuard` so a caller who lacks the *permission* for a route sees that
 * 403 first — "you can't do this" before "your salon doesn't have this".
 *
 * Platform requests (SUPER_ADMIN, no `tenantContext`) always pass: entitlements
 * describe a tenant's own plan, and a platform route was never tenant-scoped
 * to begin with.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<ModuleKey>(MODULE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const modules = req.tenantContext?.modules;
    if (!modules) {
      return true;
    }

    if (!modules[required]) {
      throw new ApiError({
        statusCode: 403,
        code: "MODULE_NOT_ENABLED",
        message: `${MODULE_LABELS[required]} isn't included in this salon's plan.`,
      });
    }

    return true;
  }
}
