import type { DataSource, ObjectLiteral, Repository } from "typeorm";
import { UserRole } from "@salon/shared";
import { TeamService } from "./team.service";
import { UserStatus } from "../enums/user-status.enum";
import type { User } from "../entities/user.entity";
import type { UserTenantRole } from "../entities/user-tenant-role.entity";
import type { PasswordService } from "../auth/services/password.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    count: vi.fn(async () => 0),
  } as unknown as Repository<T>;
}

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "nadia@salon.lk",
    name: "Nadia",
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  } as User;
}

describe("TeamService", () => {
  let users: Repository<User>;
  let roles: Repository<UserTenantRole>;
  let passwords: PasswordService;
  let audit: AuditService;
  let dataSource: DataSource;
  let service: TeamService;
  // Repos the transaction hands out. Same instances, so assertions see them.
  let txUsers: Repository<User>;
  let txRoles: Repository<UserTenantRole>;

  beforeEach(() => {
    users = mockRepo<User>();
    roles = mockRepo<UserTenantRole>();
    txUsers = mockRepo<User>();
    txRoles = mockRepo<UserTenantRole>();
    passwords = { hash: vi.fn(async () => "argon2-hash") } as unknown as PasswordService;
    audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;
    dataSource = {
      transaction: vi.fn(async (cb: (m: unknown) => unknown) =>
        cb({
          getRepository: (entity: { name: string }) =>
            entity.name === "User" ? txUsers : txRoles,
        }),
      ),
    } as unknown as DataSource;
    service = new TeamService(users, roles, passwords, audit, dataSource);
  });

  describe("create", () => {
    const dto = {
      name: "Nadia",
      email: "  Nadia@Salon.LK ",
      password: "a-real-password",
      role: UserRole.RECEPTIONIST as never,
    };

    it("creates the login against the caller's salon, never a salon in the body", async () => {
      await service.create("tenant-1", dto, "owner-1", null);

      const grant = vi.mocked(txRoles.create).mock.calls[0][0] as UserTenantRole;
      expect(grant.tenantId).toBe("tenant-1");
      expect(grant.role).toBe(UserRole.RECEPTIONIST);
    });

    it("normalises the email so a capitalised duplicate cannot slip through", async () => {
      await service.create("tenant-1", dto, "owner-1", null);

      const created = vi.mocked(txUsers.create).mock.calls[0][0] as User;
      expect(created.email).toBe("nadia@salon.lk");
    });

    it("hashes the password and never stores it", async () => {
      await service.create("tenant-1", dto, "owner-1", null);

      expect(passwords.hash).toHaveBeenCalledWith("a-real-password");
      const created = vi.mocked(txUsers.create).mock.calls[0][0] as User;
      expect(created.passwordHash).toBe("argon2-hash");
      expect(JSON.stringify(created)).not.toContain("a-real-password");
    });

    it("keeps the raw password out of the audit trail", async () => {
      await service.create("tenant-1", dto, "owner-1", null);

      const entry = vi.mocked(audit.record).mock.calls[0][0];
      expect(JSON.stringify(entry)).not.toContain("a-real-password");
      expect(JSON.stringify(entry)).not.toContain("argon2-hash");
    });

    it("refuses a second grant for someone who can already sign in here", async () => {
      vi.mocked(txUsers.findOne).mockResolvedValue(fakeUser());
      vi.mocked(txRoles.findOne).mockResolvedValue({ userId: "u1" } as UserTenantRole);

      await expect(service.create("tenant-1", dto, "owner-1", null)).rejects.toMatchObject({
        statusCode: 409,
        code: "TEAM_MEMBER_EXISTS",
      });
    });

    it("reuses an existing account when the person works at another salon", async () => {
      // A user row is global. Creating a second one would collide on the
      // unique email and lock them out of both salons.
      vi.mocked(txUsers.findOne).mockResolvedValue(fakeUser());
      vi.mocked(txRoles.findOne).mockResolvedValue(null);

      await service.create("tenant-2", dto, "owner-2", null);

      expect(txUsers.create).not.toHaveBeenCalled();
      const grant = vi.mocked(txRoles.create).mock.calls[0][0] as UserTenantRole;
      expect(grant.userId).toBe("u1");
      expect(grant.tenantId).toBe("tenant-2");
    });

    it("allows a new receptionist under the seat cap", async () => {
      vi.mocked(txRoles.count).mockResolvedValueOnce(0);

      await service.create("tenant-1", dto, "owner-1", {
        maxManagers: 0,
        maxReceptionists: 1,
        maxStaff: null,
        maxServices: null,
        maxIncentivePlans: null,
        maxBookingsPerDay: null,
        maxBookingWindowDays: null,
        maxReminderOffsets: null,
        maxDiscountCapPercent: null,
      });

      expect(txRoles.save).toHaveBeenCalled();
    });

    it("refuses a new receptionist once the seat cap is reached", async () => {
      vi.mocked(txRoles.count).mockResolvedValueOnce(1);

      await expect(
        service.create("tenant-1", dto, "owner-1", {
          maxManagers: 0,
          maxReceptionists: 1,
          maxStaff: null,
          maxServices: null,
          maxIncentivePlans: null,
          maxBookingsPerDay: null,
          maxBookingWindowDays: null,
          maxReminderOffsets: null,
          maxDiscountCapPercent: null,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TEAM_SEAT_LIMIT_REACHED" });
    });

    it("never caps STAFF logins — that seat rides on the stylist profile cap instead", async () => {
      const staffDto = { ...dto, role: UserRole.STAFF as never };
      vi.mocked(txRoles.count).mockResolvedValueOnce(999);

      await service.create("tenant-1", staffDto, "owner-1", {
        maxManagers: 0,
        maxReceptionists: 0,
        maxStaff: 0,
        maxServices: null,
        maxIncentivePlans: null,
        maxBookingsPerDay: null,
        maxBookingWindowDays: null,
        maxReminderOffsets: null,
        maxDiscountCapPercent: null,
      });

      expect(txRoles.save).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    function grantFor(role: UserRole, userId = "u2") {
      vi.mocked(roles.findOne).mockResolvedValue({
        userId,
        tenantId: "tenant-1",
        role,
        user: fakeUser({ id: userId }),
      } as UserTenantRole & { user: User });
    }

    it("refuses someone who has no access to this salon", async () => {
      vi.mocked(roles.findOne).mockResolvedValue(null);

      await expect(
        service.update("tenant-1", "stranger", { role: UserRole.STAFF as never }, "owner-1"),
      ).rejects.toMatchObject({ statusCode: 404, code: "TEAM_MEMBER_NOT_FOUND" });
    });

    it("will not let the owner's own access be changed", async () => {
      grantFor(UserRole.OWNER);

      await expect(
        service.update("tenant-1", "u2", { status: "DISABLED" }, "owner-1"),
      ).rejects.toMatchObject({ code: "CANNOT_MODIFY_OWNER" });
    });

    it("will not let a user lock themselves out", async () => {
      // There is no self-service way back in, so this is a one-way door.
      grantFor(UserRole.MANAGER, "owner-1");

      await expect(
        service.update("tenant-1", "owner-1", { status: "DISABLED" }, "owner-1"),
      ).rejects.toMatchObject({ code: "CANNOT_MODIFY_SELF" });
    });

    it("disables rather than deletes, so the audit trail keeps its actor", async () => {
      grantFor(UserRole.RECEPTIONIST);

      const result = await service.update("tenant-1", "u2", { status: "DISABLED" }, "owner-1");

      expect(result.status).toBe(UserStatus.DISABLED);
      expect(users.save).toHaveBeenCalled();
    });

    it("records the change in the audit trail", async () => {
      grantFor(UserRole.STAFF);

      await service.update("tenant-1", "u2", { role: UserRole.MANAGER as never }, "owner-1");

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TEAM_MEMBER_UPDATED", tenantId: "tenant-1" }),
      );
    });
  });

  describe("list", () => {
    it("lists only grants belonging to the caller's salon", async () => {
      await service.list("tenant-1");

      expect(roles.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "tenant-1" } }),
      );
    });

    it("never leaks a password hash", async () => {
      vi.mocked(roles.find).mockResolvedValue([
        { role: UserRole.STAFF, user: fakeUser({ passwordHash: "$argon2id$secret" }) },
      ] as Array<UserTenantRole & { user: User }>);

      const result = await service.list("tenant-1");

      expect(JSON.stringify(result)).not.toContain("argon2");
    });
  });
});
