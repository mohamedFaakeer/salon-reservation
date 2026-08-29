import type { ObjectLiteral, Repository } from "typeorm";
import { BranchService } from "./branch.service";
import type { Branch } from "../entities/branch.entity";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(),
  } as unknown as Repository<T>;
  return repo;
}

describe("BranchService", () => {
  let branches: Repository<Branch>;
  let service: BranchService;

  beforeEach(() => {
    branches = mockRepo<Branch>();
    service = new BranchService(branches);
  });

  describe("getDefaultBranch", () => {
    it("throws BRANCH_NOT_FOUND when no branch exists for the tenant", async () => {
      vi.mocked(branches.findOne).mockResolvedValue(null);

      await expect(service.getDefaultBranch("tenant-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "BRANCH_NOT_FOUND",
      });
    });
  });

  describe("updateDefaultBranch", () => {
    it("only overwrites provided fields, leaving others untouched", async () => {
      const branch = {
        id: "b1",
        tenantId: "tenant-1",
        name: "Main Branch",
        address: "123 Main St",
        phone: "0771234567",
        active: true,
      } as Branch;
      vi.mocked(branches.findOne).mockResolvedValue(branch);

      const result = await service.updateDefaultBranch("tenant-1", { name: "Renamed Branch" });

      expect(result.name).toBe("Renamed Branch");
      expect(result.address).toBe("123 Main St");
      expect(result.phone).toBe("0771234567");
    });

    it("sets latitude and longitude together", async () => {
      const branch = { id: "b1", tenantId: "tenant-1", latitude: null, longitude: null } as Branch;
      vi.mocked(branches.findOne).mockResolvedValue(branch);

      const result = await service.updateDefaultBranch("tenant-1", { latitude: 6.9271, longitude: 79.8612 });

      expect(result.latitude).toBe(6.9271);
      expect(result.longitude).toBe(79.8612);
    });

    it("clears both coordinates when explicitly set to null", async () => {
      const branch = { id: "b1", tenantId: "tenant-1", latitude: 6.9271, longitude: 79.8612 } as Branch;
      vi.mocked(branches.findOne).mockResolvedValue(branch);

      const result = await service.updateDefaultBranch("tenant-1", { latitude: null, longitude: null });

      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
    });
  });
});
