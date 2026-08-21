import type { DataSource, ObjectLiteral, Repository } from "typeorm";
import { StaffService } from "./staff.service";
import type { Staff } from "../entities/staff.entity";
import type { StaffServiceAssignment } from "../entities/staff-service.entity";
import type { Service } from "../entities/service.entity";
import type { User } from "../entities/user.entity";
import type { IncentivePlan } from "../entities/incentive-plan.entity";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T> | Partial<T>[]) => e as T),
    save: vi.fn(async (e: unknown) => e),
    find: vi.fn(async () => []),
    findOne: vi.fn(),
    delete: vi.fn(),
  } as unknown as Repository<T>;
  return repo;
}

function baseStaff(): Staff {
  return {
    id: "staff-1",
    tenantId: "tenant-1",
    branchId: null,
    userId: null,
    name: "Kasun",
    phone: null,
    specialties: null,
    active: true,
    color: null,
  } as Staff;
}

describe("StaffService", () => {
  let staff: Repository<Staff>;
  let assignments: Repository<StaffServiceAssignment>;
  let services: Repository<Service>;
  let users: Repository<User>;
  let incentivePlans: Repository<IncentivePlan>;
  let dataSource: DataSource;
  let service: StaffService;

  beforeEach(() => {
    staff = mockRepo<Staff>();
    assignments = mockRepo<StaffServiceAssignment>();
    services = mockRepo<Service>();
    users = mockRepo<User>();
    incentivePlans = mockRepo<IncentivePlan>();
    dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = { getRepository: () => assignments };
        return cb(manager);
      }),
    } as unknown as DataSource;
    service = new StaffService(staff, assignments, services, users, incentivePlans, dataSource);
  });

  describe("create", () => {
    it("persists with the caller's tenantId, branchId: null, active: true", async () => {
      await service.create("tenant-1", { name: "Kasun" });

      const created = vi.mocked(staff.create).mock.calls[0][0] as Staff;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.branchId).toBeNull();
      expect(created.active).toBe(true);
    });

    it("validates a linked userId exists", async () => {
      vi.mocked(users.findOne).mockResolvedValue(null);

      await expect(
        service.create("tenant-1", { name: "Kasun", userId: "user-1" }),
      ).rejects.toMatchObject({ statusCode: 400, code: "USER_NOT_FOUND" });
    });

    it("rejects a userId already linked to another staff member in the tenant", async () => {
      vi.mocked(users.findOne).mockResolvedValue({ id: "user-1" } as User);
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());

      await expect(
        service.create("tenant-1", { name: "Nadeesha", userId: "user-1" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "STAFF_USER_ALREADY_LINKED" });
    });
  });

  describe("update", () => {
    it("throws STAFF_NOT_FOUND for a cross-tenant id", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);

      await expect(
        service.update("tenant-B", "staff-1", { name: "X" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "STAFF_NOT_FOUND" });
    });

    it("does not re-check linkage when userId is unchanged", async () => {
      const existing = { ...baseStaff(), userId: "user-1" } as Staff;
      vi.mocked(staff.findOne).mockResolvedValueOnce(existing);

      await service.update("tenant-1", "staff-1", { userId: "user-1" });

      // Only the initial findOwned lookup happened, not a second linkage check.
      expect(staff.findOne).toHaveBeenCalledTimes(1);
    });

    it("rejects an incentive plan id that belongs to another tenant", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(baseStaff());
      vi.mocked(incentivePlans.findOne).mockResolvedValueOnce(null);

      await expect(
        service.update("tenant-1", "staff-1", { incentivePlanId: "plan-from-elsewhere" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "INCENTIVE_PLAN_NOT_FOUND" });
    });

    it("assigns an incentive plan confirmed to belong to the tenant", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce(baseStaff());
      vi.mocked(incentivePlans.findOne).mockResolvedValueOnce({ id: "plan-1" } as IncentivePlan);

      await service.update("tenant-1", "staff-1", { incentivePlanId: "plan-1" });

      const saved = vi.mocked(staff.save).mock.calls[0][0] as Staff;
      expect(saved.incentivePlanId).toBe("plan-1");
    });

    it("unassigns a plan when incentivePlanId is set to null, with no ownership lookup needed", async () => {
      vi.mocked(staff.findOne).mockResolvedValueOnce({ ...baseStaff(), incentivePlanId: "plan-1" });

      await service.update("tenant-1", "staff-1", { incentivePlanId: null });

      expect(incentivePlans.findOne).not.toHaveBeenCalled();
      const saved = vi.mocked(staff.save).mock.calls[0][0] as Staff;
      expect(saved.incentivePlanId).toBeNull();
    });
  });

  describe("setServices", () => {
    it("rejects service ids that don't belong to the tenant", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      vi.mocked(services.find).mockResolvedValue([{ id: "svc-1" } as Service]);

      await expect(
        service.setServices("tenant-1", "staff-1", { serviceIds: ["svc-1", "svc-2"] }),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_SERVICE_IDS" });
    });

    it("replaces the assignment set inside a transaction", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      vi.mocked(services.find).mockResolvedValue([
        { id: "svc-1" } as Service,
        { id: "svc-2" } as Service,
      ]);

      await service.setServices("tenant-1", "staff-1", {
        serviceIds: ["svc-1", "svc-2"],
      });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(assignments.delete).toHaveBeenCalledWith({
        staffId: "staff-1",
        tenantId: "tenant-1",
      });
      expect(assignments.save).toHaveBeenCalled();
    });

    it("clears all assignments when given an empty array", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());

      await service.setServices("tenant-1", "staff-1", { serviceIds: [] });

      expect(assignments.delete).toHaveBeenCalledWith({
        staffId: "staff-1",
        tenantId: "tenant-1",
      });
      expect(services.find).not.toHaveBeenCalled();
    });
  });

  describe("getServices", () => {
    it("returns services matching the staff's assignment rows", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      vi.mocked(assignments.find).mockResolvedValue([
        { staffId: "staff-1", serviceId: "svc-1", tenantId: "tenant-1" } as StaffServiceAssignment,
      ]);
      vi.mocked(services.find).mockResolvedValue([{ id: "svc-1" } as Service]);

      const result = await service.getServices("tenant-1", "staff-1");

      expect(result).toEqual([{ id: "svc-1" }]);
    });

    it("returns an empty array without querying services when no assignments exist", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      vi.mocked(assignments.find).mockResolvedValue([]);

      const result = await service.getServices("tenant-1", "staff-1");

      expect(result).toEqual([]);
      expect(services.find).not.toHaveBeenCalled();
    });
  });
});
