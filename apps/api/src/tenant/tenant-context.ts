import type { Request } from "express";
import { ApiError } from "@salon/shared";
import type { AccessTokenPayload } from "../auth/services/token.service";

export interface TenantContextData {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  branchId: string | null;
  roles: string[];
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