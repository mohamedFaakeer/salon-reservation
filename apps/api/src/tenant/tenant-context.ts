import type { Request } from "express";
import { ApiError, type ModuleKey, type ReportPanelKey, type TenantLimits } from "@salon/shared";
import type { AccessTokenPayload } from "../auth/services/token.service";

export interface TenantContextData {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  branchId: string | null;
  roles: string[];
  /**
   * The tenant's resolved Lite/Pro entitlements, attached by `TenantGuard`
   * from the same `Tenant` row it already loads — never a second query.
   * Optional so existing test mocks that build a `TenantContextData` literal
   * without it stay valid; only `ModuleGuard` and callers that need it read it.
   */
  modules?: Record<ModuleKey, boolean>;
  reportPanels?: Record<ReportPanelKey, boolean>;
  limits?: Required<TenantLimits>;
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
  tenantContext?: TenantContextData;
}

export function getTenantContext(req: Request): TenantContextData {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.tenantContext) {
    throw new ApiError({
      statusCode: 403,
      code: "TENANT_CONTEXT_MISSING",
      message: "Tenant context is not available for this request.",
    });
  }
  return authReq.tenantContext;
}