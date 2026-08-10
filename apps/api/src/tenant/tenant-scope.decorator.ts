import { SetMetadata } from "@nestjs/common";

export const TENANT_SCOPE_KEY = "tenantScope";

/**
 * Marks a route as tenant-scoped. Auth-guarded routes are tenant-scoped by
 * default; this decorator is for documentation/selectivity and future
 * platform-level routes that opt out.
 */
export const TenantScope = () => SetMetadata(TENANT_SCOPE_KEY, true);