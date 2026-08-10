import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Repository } from "typeorm";
import { ApiError, UserRole } from "@salon/shared";
import { Tenant } from "../entities/tenant.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";
import type { AccessTokenPayload } from "../auth/services/token.service";
import type {
  AuthenticatedRequest,
  TenantContextData,
} from "./tenant-context";

/**
 * Global tenant-isolation guard. Runs AFTER JwtAuthGuard (APP_GUARD order:
 * AuthModule first, TenantModule second) so `req.user` is always present.
 *
 * Guarantees:
 *  1. the tenant id is taken from the verified JWT — never from the client
 *  2. the tenant still exists and is ACTIVE (suspension is enforced live)
 *  3. the user still has an active membership row (revoked access is cut)
 *  4. SUPER_ADMIN platform users (tenantId=null) pass without a tenant context
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(UserTenantRole)
    private readonly roles: Repository<UserTenantRole>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.isPublic(ctx)) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Missing bearer token.",
      });
    }

    // Platform-level SUPER_ADMIN: no tenant context required.
    if (!user.tenantId) {
      return true;
    }

    await this.attachTenantContext(req, user);
    return true;
  }

  private isPublic(ctx: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false
    );
  }

  private async attachTenantContext(
    req: Request,
    user: AccessTokenPayload,
  ): Promise<void> {
    const tenantId = user.tenantId;
    if (!tenantId) {
      return;
    }

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new ApiError({
        statusCode: 403,
        code: "TENANT_NOT_FOUND",
        message: "Your account is not associated with an active tenant.",
      });
    }
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ApiError({
        statusCode: 403,
        code: "TENANT_SUSPENDED",
        message: "This salon account is suspended. Contact support.",
      });
    }

    const membership = await this.roles.findOne({
      where: { userId: user.sub, tenantId },
    });
    if (!membership) {
      throw new ApiError({
        statusCode: 403,
        code: "TENANT_ACCESS_DENIED",
        message: "You no longer have access to this salon account.",
      });
    }

    const roles = Array.from(
      new Set([...(user.roles ?? []), membership.role]),
    ).filter(
      (role): role is UserRole =>
        Object.values(UserRole).includes(role as UserRole),
    );

    const context: TenantContextData = {
      userId: user.sub,
      email: user.email,
      name: user.name,
      tenantId,
      branchId: user.branchId,
      roles,
    };
    (req as AuthenticatedRequest).tenantContext = context;
  }
}