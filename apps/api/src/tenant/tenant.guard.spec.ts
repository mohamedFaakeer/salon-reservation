import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { Repository } from "typeorm";
import type { Request } from "express";
import { TenantGuard } from "./tenant.guard";
import type { AuditService } from "../audit/audit.service";
import type { Tenant } from "../entities/tenant.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
import type { UserTenantRole } from "../entities/user-tenant-role.entity";
import type { AuthenticatedRequest } from "./tenant-context";

function mockAudit(): AuditService {
  return { record: vi.fn(async () => undefined) } as unknown as AuditService;
}

function ctxWithUser(user: { sub: string; tenantId: string | null }): ExecutionContext {
  const req = {
    ip: "203.0.113.7",
    headers: { "user-agent": "test-agent" },
    user,
  } as unknown as AuthenticatedRequest & Request;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("TenantGuard — cross-tenant rejection auditing", () => {
  let tenants: Repository<Tenant>;
  let roles: Repository<UserTenantRole>;
  let audit: AuditService;
  let reflector: Reflector;
  let guard: TenantGuard;

  beforeEach(() => {
    tenants = { findOne: vi.fn() } as unknown as Repository<Tenant>;
    roles = { findOne: vi.fn() } as unknown as Repository<UserTenantRole>;
    audit = mockAudit();
    reflector = { getAllAndOverride: vi.fn(() => false) } as unknown as Reflector;
    guard = new TenantGuard(reflector, tenants, roles, audit);
  });

  it("audits CROSS_TENANT_TOKEN_REJECTED when the tenant no longer exists", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue(null);
    const ctx = ctxWithUser({ sub: "user-1", tenantId: "tenant-1" });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CROSS_TENANT_TOKEN_REJECTED",
        actorUserId: "user-1",
        tenantId: "tenant-1",
        metadata: { reason: "TENANT_NOT_FOUND" },
        ipAddress: "203.0.113.7",
      }),
    );
  });

  it("audits CROSS_TENANT_TOKEN_REJECTED when the tenant is suspended", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ status: TenantStatus.SUSPENDED } as Tenant);
    const ctx = ctxWithUser({ sub: "user-1", tenantId: "tenant-1" });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: "TENANT_SUSPENDED" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CROSS_TENANT_TOKEN_REJECTED", metadata: { reason: "TENANT_SUSPENDED" } }),
    );
  });

  it("audits CROSS_TENANT_TOKEN_REJECTED when membership was revoked", async () => {
    vi.mocked(tenants.findOne).mockResolvedValue({ status: TenantStatus.ACTIVE } as Tenant);
    vi.mocked(roles.findOne).mockResolvedValue(null);
    const ctx = ctxWithUser({ sub: "user-1", tenantId: "tenant-1" });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: "TENANT_ACCESS_DENIED" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CROSS_TENANT_TOKEN_REJECTED", metadata: { reason: "TENANT_ACCESS_DENIED" } }),
    );
  });
});
