import type { ObjectLiteral, Repository } from "typeorm";
import { TagService } from "./tag.service";
import type { Tag } from "../entities/tag.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    delete: vi.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<T>;
}

describe("TagService", () => {
  let tags: Repository<Tag>;
  let service: TagService;

  beforeEach(() => {
    tags = mockRepo<Tag>();
    service = new TagService(tags);
  });

  describe("list", () => {
    it("scopes to the tenant, alphabetically", async () => {
      await service.list("tenant-1");
      expect(tags.find).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" }, order: { label: "ASC" } });
    });
  });

  describe("create", () => {
    it("trims the label and persists with the caller's tenantId", async () => {
      await service.create("tenant-1", { label: "  VIP  " });
      const created = vi.mocked(tags.create).mock.calls[0][0] as Tag;
      expect(created).toMatchObject({ tenantId: "tenant-1", label: "VIP", color: null });
    });

    it("maps a unique-violation to DUPLICATE_TAG", async () => {
      vi.mocked(tags.save).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

      await expect(service.create("tenant-1", { label: "VIP" })).rejects.toMatchObject({
        statusCode: 409,
        code: "DUPLICATE_TAG",
      });
    });
  });

  describe("update", () => {
    it("404s on a tag from another tenant", async () => {
      vi.mocked(tags.findOne).mockResolvedValueOnce(null);

      await expect(service.update("tenant-1", "tag-1", { label: "Renamed" })).rejects.toMatchObject({
        statusCode: 404,
        code: "TAG_NOT_FOUND",
      });
    });

    it("renames an owned tag", async () => {
      vi.mocked(tags.findOne).mockResolvedValueOnce({ id: "tag-1", tenantId: "tenant-1", label: "VIP", color: null } as Tag);

      await service.update("tenant-1", "tag-1", { label: "Regular" });

      expect(tags.save).toHaveBeenCalledWith(expect.objectContaining({ label: "Regular" }));
    });
  });

  describe("remove", () => {
    it("404s on a tag from another tenant rather than silently deleting nothing", async () => {
      vi.mocked(tags.findOne).mockResolvedValueOnce(null);

      await expect(service.remove("tenant-1", "tag-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "TAG_NOT_FOUND",
      });
      expect(tags.delete).not.toHaveBeenCalled();
    });

    it("deletes an owned tag — CustomerTag rows cascade via the FK, no separate cleanup", async () => {
      vi.mocked(tags.findOne).mockResolvedValueOnce({ id: "tag-1", tenantId: "tenant-1" } as Tag);

      await service.remove("tenant-1", "tag-1");

      expect(tags.delete).toHaveBeenCalledWith({ id: "tag-1", tenantId: "tenant-1" });
    });
  });
});
