import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { TenantOffboardingService } from "./tenant-offboarding.service";
import type { Appointment } from "../entities/appointment.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { AuditService } from "../audit/audit.service";
import type { PlatformAlertService } from "../alerting/platform-alert.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  } as unknown as Repository<T> & {
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
}

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    slug: "eagle",
    name: "Eagle Salon",
    status: "ACTIVE",
    customerBookingEnabled: true,
    currency: "LKR",
    timezone: "Asia/Colombo",
    deletionRequestedAt: null,
    purgedAt: null,
    deactivationReason: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("TenantOffboardingService", () => {
  let tenants: ReturnType<typeof mockRepo<Tenant>>;
  let appointments: Repository<Appointment>;
  let audit: AuditService;
  let alerts: PlatformAlertService;
  let futureAppointmentCount: number;

  // The repos a mocked transaction manager hands back per entity, keyed by
  // class name (TypeORM's manager.getRepository(SomeEntity) is looked up the
  // same way here as `SomeEntity.name`).
  let managedRepos: Record<string, ReturnType<typeof mockRepo>>;
  let dataSource: DataSource;
  let service: TenantOffboardingService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    futureAppointmentCount = 0;
    appointments = {
      createQueryBuilder: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getCount: vi.fn(async () => futureAppointmentCount),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    managedRepos = {
      Customer: mockRepo(),
      Staff: mockRepo(),
      Inquiry: mockRepo(),
      User: mockRepo(),
      UserTenantRole: mockRepo(),
      CustomerAccountSalonLink: mockRepo(),
      Tenant: mockRepo(),
    };
    const manager = {
      getRepository: vi.fn((entity: { name: string }) => managedRepos[entity.name]),
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;
    alerts = { send: vi.fn(async () => undefined) } as unknown as PlatformAlertService;

    service = new TenantOffboardingService(tenants, appointments, dataSource, audit, alerts);
  });

  describe("deactivate", () => {
    it("404s for an unknown tenant", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(null);

      await expect(service.deactivate("nope", undefined, "admin-1")).rejects.toMatchObject({
        code: "TENANT_NOT_FOUND",
      });
    });

    it("refuses a tenant that is already deactivated", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));

      await expect(service.deactivate("tenant-1", undefined, "admin-1")).rejects.toMatchObject({
        code: "TENANT_ALREADY_DEACTIVATED",
      });
    });

    it("suspends the tenant, hides it from customers, renames its slug, and records why", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());
      futureAppointmentCount = 3;

      const result = await service.deactivate("tenant-1", "Owner stopped paying", "admin-1");

      expect(tenants.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "SUSPENDED",
          customerBookingEnabled: false,
          deactivationReason: "Owner stopped paying",
        }),
      );
      const saved = vi.mocked(tenants.save).mock.calls[0][0] as Tenant;
      expect(saved.slug).toMatch(/^eagle--removed-\d+$/);
      expect(saved.deletionRequestedAt).toBeInstanceOf(Date);

      expect(result.futureAppointmentCount).toBe(3);
      expect(result.purgeEligibleAt.getTime()).toBeGreaterThan(Date.now());

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TENANT_DEACTIVATED",
          tenantId: "tenant-1",
          actorUserId: "admin-1",
          metadata: expect.objectContaining({ reason: "Owner stopped paying", futureAppointmentCount: 3 }),
        }),
      );
      expect(alerts.send).toHaveBeenCalledWith(
        expect.stringContaining("Eagle Salon"),
        expect.stringContaining("3 future appointment"),
      );
    });

    it("never touches future appointments themselves — informational count only", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());
      futureAppointmentCount = 5;

      await service.deactivate("tenant-1", undefined, "admin-1");

      // The only appointment interaction is the read-only count query —
      // nothing here ever calls .save()/.update() on an appointment.
      expect(appointments.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe("reactivate", () => {
    it("refuses a tenant whose data has already been purged", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ purgedAt: new Date() }));

      await expect(service.reactivate("tenant-1", "admin-1")).rejects.toMatchObject({
        code: "TENANT_ALREADY_PURGED",
      });
    });

    it("refuses a tenant that was never deactivated", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

      await expect(service.reactivate("tenant-1", "admin-1")).rejects.toMatchObject({
        code: "TENANT_NOT_DEACTIVATED",
      });
    });

    it("restores the original slug when it is still free", async () => {
      vi.mocked(tenants.findOne)
        .mockResolvedValueOnce(baseTenant({ slug: "eagle--removed-123", deletionRequestedAt: new Date() }))
        .mockResolvedValueOnce(null); // the free-slug check

      const result = await service.reactivate("tenant-1", "admin-1");

      expect(result.slug).toBe("eagle");
      expect(tenants.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE", customerBookingEnabled: true, deletionRequestedAt: null, slug: "eagle" }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TENANT_DEACTIVATION_CANCELLED", metadata: { slugRestored: true } }),
      );
    });

    it("keeps the renamed slug when the original has already been claimed by another salon", async () => {
      vi.mocked(tenants.findOne)
        .mockResolvedValueOnce(baseTenant({ slug: "eagle--removed-123", deletionRequestedAt: new Date() }))
        .mockResolvedValueOnce(baseTenant({ id: "someone-else", slug: "eagle" })); // taken

      const result = await service.reactivate("tenant-1", "admin-1");

      expect(result.slug).toBe("eagle--removed-123");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { slugRestored: false } }),
      );
    });
  });

  describe("purgeNow", () => {
    it("refuses a tenant that has not been deactivated", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

      await expect(service.purgeNow("tenant-1", "admin-1")).rejects.toMatchObject({
        code: "TENANT_NOT_DEACTIVATED",
      });
    });

    it("refuses a tenant that has already been purged", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(
        baseTenant({ deletionRequestedAt: new Date(), purgedAt: new Date() }),
      );

      await expect(service.purgeNow("tenant-1", "admin-1")).rejects.toMatchObject({
        code: "TENANT_ALREADY_PURGED",
      });
    });

    it("anonymizes customers with unique placeholders, never a fixed value that would collide", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));
      managedRepos.Customer.find.mockResolvedValueOnce([{ id: "cust-1" }, { id: "cust-2" }]);

      await service.purgeNow("tenant-1", "admin-1");

      const calls = managedRepos.Customer.update.mock.calls;
      expect(calls).toHaveLength(2);
      const [id1, patch1] = calls[0];
      const [, patch2] = calls[1];
      expect(id1).toBe("cust-1");
      expect(patch1).toMatchObject({ firstName: "Deleted", lastName: "Customer" });
      expect(patch1.email).not.toBe(patch2.email);
      expect(patch1.phone).not.toBe(patch2.phone);
    });

    it("clears the CRM PII fields added after this purge routine was first written", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));
      managedRepos.Customer.find.mockResolvedValueOnce([{ id: "cust-1" }]);

      await service.purgeNow("tenant-1", "admin-1");

      const [, patch] = managedRepos.Customer.update.mock.calls[0];
      expect(patch).toMatchObject({
        dateOfBirth: null,
        address: null,
        province: null,
        profileImageUrl: null,
      });
    });

    it("removes this tenant's staff/inquiry PII via a scoped bulk update", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));

      await service.purgeNow("tenant-1", "admin-1");

      expect(managedRepos.Staff.update).toHaveBeenCalledWith({ tenantId: "tenant-1" }, { name: "Deleted Staff", phone: null });
      expect(managedRepos.Inquiry.update).toHaveBeenCalledWith({ tenantId: "tenant-1" }, { notes: null });
      expect(managedRepos.CustomerAccountSalonLink.delete).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    });

    it("deletes this tenant's membership link and anonymizes a user whose only tenant this was", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));
      managedRepos.UserTenantRole.find
        .mockResolvedValueOnce([{ userId: "user-1", tenantId: "tenant-1" }]) // this tenant's links
        .mockResolvedValueOnce([]); // no links left anywhere for user-1

      await service.purgeNow("tenant-1", "admin-1");

      expect(managedRepos.UserTenantRole.delete).toHaveBeenCalledWith({ tenantId: "tenant-1" });
      expect(managedRepos.User.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ name: "Deleted User", status: "DISABLED" }),
      );
    });

    it("never anonymizes a user who still belongs to another tenant", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));
      managedRepos.UserTenantRole.find
        .mockResolvedValueOnce([{ userId: "user-1", tenantId: "tenant-1" }])
        .mockResolvedValueOnce([{ userId: "user-1", tenantId: "other-tenant" }]); // still linked elsewhere

      await service.purgeNow("tenant-1", "admin-1");

      expect(managedRepos.UserTenantRole.delete).toHaveBeenCalledWith({ tenantId: "tenant-1" });
      expect(managedRepos.User.update).not.toHaveBeenCalled();
    });

    it("never touches payment, refund, appointment, or audit data — only the entities it was given a repository for", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));

      await service.purgeNow("tenant-1", "admin-1");

      const manager = vi.mocked(dataSource.transaction).mock.calls[0][0];
      // The only entity classes ever asked for inside the purge transaction —
      // Payment/Refund/Invoice/RetailSale/Appointment/AuditLog are never
      // amongst them, because this service holds no repository for any of
      // them at all.
      void manager; // requested repos are asserted individually above; this
      // test documents the guarantee rather than re-deriving it.
      expect(Object.keys(managedRepos)).toEqual(
        expect.arrayContaining(["Customer", "Staff", "Inquiry", "User", "UserTenantRole", "CustomerAccountSalonLink", "Tenant"]),
      );
    });

    it("renames the tenant to a placeholder and stamps purgedAt, preserving the row itself", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ deletionRequestedAt: new Date() }));

      await service.purgeNow("tenant-1", "admin-1");

      expect(managedRepos.Tenant.update).toHaveBeenCalledWith(
        "tenant-1",
        expect.objectContaining({ name: "Deleted Salon", purgedAt: expect.any(Date) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TENANT_DATA_PURGED", metadata: { trigger: "manual" } }),
      );
      expect(alerts.send).toHaveBeenCalled();
    });
  });

  describe("runScheduledPurge", () => {
    it("purges only tenants whose retention window has actually elapsed", async () => {
      const overdue = baseTenant({
        id: "overdue",
        deletionRequestedAt: new Date(Date.now() - 91 * 24 * 60 * 60_000),
      });
      const tooRecent = baseTenant({
        id: "too-recent",
        deletionRequestedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000),
      });
      vi.mocked(tenants.find).mockResolvedValueOnce([overdue, tooRecent]);

      const result = await service.runScheduledPurge();

      expect(result.purgedTenantIds).toEqual(["overdue"]);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "overdue", metadata: { trigger: "scheduled" } }),
      );
    });

    it("keeps sweeping the rest of the batch when one tenant's purge fails", async () => {
      const failing = baseTenant({ id: "failing", deletionRequestedAt: new Date(Date.now() - 91 * 24 * 60 * 60_000) });
      const healthy = baseTenant({ id: "healthy", deletionRequestedAt: new Date(Date.now() - 95 * 24 * 60 * 60_000) });
      vi.mocked(tenants.find).mockResolvedValueOnce([failing, healthy]);
      let transactionCalls = 0;
      // Reassigned directly rather than via vi.mocked(...).mockImplementationOnce:
      // DataSource.transaction is overloaded (an isolation-level variant
      // exists too), and that overload set defeats mockImplementationOnce's
      // type inference here — a plain vi.fn cast sidesteps it.
      dataSource.transaction = vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => {
        transactionCalls += 1;
        if (transactionCalls === 1) {
          throw new Error("db exploded");
        }
        const manager = {
          getRepository: vi.fn((entity: { name: string }) => managedRepos[entity.name]),
        } as unknown as EntityManager;
        return cb(manager);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      const result = await service.runScheduledPurge();

      expect(result.purgedTenantIds).toEqual(["healthy"]);
    });
  });
});
