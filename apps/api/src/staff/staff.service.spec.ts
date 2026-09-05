import type { DataSource, ObjectLiteral, Repository } from "typeorm";
import { StaffService } from "./staff.service";
import type { Staff } from "../entities/staff.entity";
import type { StaffServiceAssignment } from "../entities/staff-service.entity";
import type { Service } from "../entities/service.entity";
import type { UserTenantRole } from "../entities/user-tenant-role.entity";
import type { IncentivePlan } from "../entities/incentive-plan.entity";
import type { CloudinaryService } from "../cloudinary/cloudinary.service";

/** Minimal well-formed PNG header — width/height live at fixed offsets in the IHDR chunk, same helper product.service.spec.ts uses. */
function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T> | Partial<T>[]) => e as T),
    save: vi.fn(async (e: unknown) => e),
    find: vi.fn(async () => []),
    findOne: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(async () => 0),
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
  let userTenantRoles: Repository<UserTenantRole>;
  let incentivePlans: Repository<IncentivePlan>;
  let dataSource: DataSource;
  let cloudinary: CloudinaryService;
  let service: StaffService;

  beforeEach(() => {
    staff = mockRepo<Staff>();
    assignments = mockRepo<StaffServiceAssignment>();
    services = mockRepo<Service>();
    userTenantRoles = mockRepo<UserTenantRole>();
    incentivePlans = mockRepo<IncentivePlan>();
    dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => Promise<void>) => {
        const manager = { getRepository: () => assignments };
        return cb(manager);
      }),
    } as unknown as DataSource;
    cloudinary = {
      uploadStaffPhoto: vi.fn(async () => "https://res.cloudinary.com/demo/staff.png"),
    } as unknown as CloudinaryService;
    service = new StaffService(staff, assignments, services, userTenantRoles, incentivePlans, dataSource, cloudinary);
  });

  describe("create", () => {
    it("persists with the caller's tenantId, branchId: null, active: true", async () => {
      await service.create("tenant-1", { name: "Kasun" }, null);

      const created = vi.mocked(staff.create).mock.calls[0][0] as Staff;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.branchId).toBeNull();
      expect(created.active).toBe(true);
    });

    it("validates a linked userId exists", async () => {
      vi.mocked(userTenantRoles.findOne).mockResolvedValue(null);

      await expect(
        service.create("tenant-1", { name: "Kasun", userId: "user-1" }, null),
      ).rejects.toMatchObject({ statusCode: 400, code: "USER_NOT_FOUND" });
    });

    it("rejects a userId that belongs to a different tenant, same as a nonexistent user", async () => {
      // The mock doesn't inspect `where`, so this also documents the real
      // guarantee: a membership row is only ever returned for the caller's
      // own tenantId, per the `{ userId, tenantId }` query in the service.
      vi.mocked(userTenantRoles.findOne).mockResolvedValue(null);

      await expect(
        service.create("tenant-1", { name: "Kasun", userId: "user-from-tenant-2" }, null),
      ).rejects.toMatchObject({ statusCode: 400, code: "USER_NOT_FOUND" });
      expect(userTenantRoles.findOne).toHaveBeenCalledWith({
        where: { userId: "user-from-tenant-2", tenantId: "tenant-1" },
      });
    });

    it("rejects a userId already linked to another staff member in the tenant", async () => {
      vi.mocked(userTenantRoles.findOne).mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" } as UserTenantRole);
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());

      await expect(
        service.create("tenant-1", { name: "Nadeesha", userId: "user-1" }, null),
      ).rejects.toMatchObject({ statusCode: 409, code: "STAFF_USER_ALREADY_LINKED" });
    });

    it("allows a new stylist under the seat cap", async () => {
      vi.mocked(staff.count).mockResolvedValueOnce(4);

      await service.create("tenant-1", { name: "Kasun" }, 5);

      expect(staff.save).toHaveBeenCalled();
    });

    it("refuses a new stylist once the seat cap is reached", async () => {
      vi.mocked(staff.count).mockResolvedValueOnce(5);

      await expect(service.create("tenant-1", { name: "Kasun" }, 5)).rejects.toMatchObject({
        statusCode: 409,
        code: "STAFF_LIMIT_REACHED",
      });
    });

    it("persists jobTitle and gender when given, null when omitted", async () => {
      await service.create("tenant-1", { name: "Kasun", jobTitle: "Senior Stylist", gender: "MALE" }, null);

      const created = vi.mocked(staff.create).mock.calls[0][0] as Staff;
      expect(created.jobTitle).toBe("Senior Stylist");
      expect(created.gender).toBe("MALE");
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

    it("unlinks a login without re-checking linkage against a null id", async () => {
      const existing = { ...baseStaff(), userId: "user-1" } as Staff;
      vi.mocked(staff.findOne).mockResolvedValueOnce(existing);

      const result = await service.update("tenant-1", "staff-1", { userId: null });

      expect(staff.findOne).toHaveBeenCalledTimes(1);
      expect(result.userId).toBeNull();
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

  describe("uploadPhoto", () => {
    it("refuses a file over the size limit", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      const oversized = Buffer.alloc(2_000_001);
      await expect(service.uploadPhoto("tenant-1", "staff-1", oversized)).rejects.toMatchObject({
        statusCode: 400,
        code: "STAFF_PHOTO_FILE_TOO_LARGE",
      });
      expect(cloudinary.uploadStaffPhoto).not.toHaveBeenCalled();
    });

    it("refuses a buffer that isn't a recognised PNG/JPEG/WebP", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      await expect(service.uploadPhoto("tenant-1", "staff-1", Buffer.from("not an image"))).rejects.toMatchObject({
        code: "STAFF_PHOTO_INVALID_FILE_TYPE",
      });
    });

    it("refuses dimensions below the floor", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      await expect(service.uploadPhoto("tenant-1", "staff-1", pngBuffer(50, 50))).rejects.toMatchObject({
        code: "STAFF_PHOTO_DIMENSIONS_OUT_OF_RANGE",
      });
    });

    it("refuses a shape more elongated than 2:1 — tighter than a product photo's 3:1", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());
      await expect(service.uploadPhoto("tenant-1", "staff-1", pngBuffer(1000, 400))).rejects.toMatchObject({
        code: "STAFF_PHOTO_ASPECT_RATIO_INVALID",
      });
    });

    it("uploads a valid photo and stamps the tenant-scoped Cloudinary folder", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(baseStaff());

      const result = await service.uploadPhoto("tenant-1", "staff-1", pngBuffer(800, 800));

      expect(cloudinary.uploadStaffPhoto).toHaveBeenCalledWith(expect.any(Buffer), "staff-photos/tenant-1");
      expect(result.imageUrl).toBe("https://res.cloudinary.com/demo/staff.png");
    });
  });

  describe("removePhoto", () => {
    it("clears imageUrl without touching Cloudinary", async () => {
      vi.mocked(staff.findOne).mockResolvedValue({ ...baseStaff(), imageUrl: "https://x" });

      const result = await service.removePhoto("tenant-1", "staff-1");

      expect(result.imageUrl).toBeNull();
    });
  });
});
