import type { ObjectLiteral, Repository } from "typeorm";
import { ClosureService } from "./closure.service";
import type { Closure } from "../entities/closure.entity";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(async (e: T) => e),
  } as unknown as Repository<T>;
  return repo;
}

describe("ClosureService", () => {
  let closures: Repository<Closure>;
  let service: ClosureService;

  beforeEach(() => {
    closures = mockRepo<Closure>();
    service = new ClosureService(closures);
  });

  describe("create", () => {
    it("rejects endDate before startDate", async () => {
      await expect(
        service.create("tenant-1", {
          startDate: "2026-12-25",
          endDate: "2026-12-20",
          name: "Bad range",
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_DATE_RANGE" });
      expect(closures.save).not.toHaveBeenCalled();
    });

    it("persists with the caller's tenantId, never a client-supplied one", async () => {
      await service.create("tenant-1", {
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        name: "Christmas",
      });

      const created = vi.mocked(closures.create).mock.calls[0][0] as Closure;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.name).toBe("Christmas");
    });
  });

  describe("remove", () => {
    it("scopes the lookup to {id, tenantId} — cross-tenant rows are invisible", async () => {
      vi.mocked(closures.findOne).mockResolvedValue(null);

      await expect(service.remove("tenant-B", "closure-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "CLOSURE_NOT_FOUND",
      });
      expect(closures.findOne).toHaveBeenCalledWith({
        where: { id: "closure-1", tenantId: "tenant-B" },
      });
    });

    it("removes a same-tenant row", async () => {
      const row = { id: "closure-1", tenantId: "tenant-A" } as Closure;
      vi.mocked(closures.findOne).mockResolvedValue(row);

      await service.remove("tenant-A", "closure-1");

      expect(closures.remove).toHaveBeenCalledWith(row);
    });
  });
});
