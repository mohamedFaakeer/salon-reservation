import type { ObjectLiteral, Repository } from "typeorm";
import { PayFrequency } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmploymentService } from "./employment.service";
import type { Employment } from "../entities/employment.entity";
import type { Staff } from "../entities/staff.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function reloaded(overrides: Partial<Employment> = {}): Employment {
  return {
    id: "generated-id",
    staffId: "s1",
    payFrequency: PayFrequency.MONTHLY,
    baseRateCents: 50_000_00,
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    supersedesEmploymentId: null,
    staff: { name: "Nadia" },
    createdByUser: { name: "Owner" },
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("EmploymentService", () => {
  let employments: Repository<Employment>;
  let staff: Repository<Staff>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: EmploymentService;

  beforeEach(() => {
    employments = mockRepo<Employment>();
    staff = mockRepo<Staff>();
    audit = { record: vi.fn(async () => undefined) };
    dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
        const manager = { getRepository: () => employments };
        return cb(manager);
      }),
    };
    vi.mocked(staff.findOne).mockResolvedValue({ id: "s1", name: "Nadia" } as Staff);
    service = new EmploymentService(employments, staff, audit as never, dataSource as never);
  });

  describe("tenant isolation", () => {
    it("history() refuses a staffId belonging to a different tenant, the same as an unknown one", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);
      await expect(service.history("tenant-1", "another-tenants-staff-id")).rejects.toMatchObject({ code: "STAFF_NOT_FOUND" });
      expect(staff.findOne).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", id: "another-tenants-staff-id" } });
    });

    it("listCurrent() only ever queries the caller's own tenantId", async () => {
      await service.listCurrent("tenant-1");
      expect(employments.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }) }));
    });
  });

  describe("upsert", () => {
    it("rejects an unknown staff member", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);
      await expect(
        service.upsert("tenant-1", "ghost", { payFrequency: PayFrequency.MONTHLY, baseRateCents: 100_000, effectiveFrom: "2026-09-01" }, "user-1"),
      ).rejects.toMatchObject({ code: "STAFF_NOT_FOUND" });
    });

    it("creates the opening version when none exists yet", async () => {
      vi.mocked(employments.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(reloaded());

      const result = await service.upsert(
        "tenant-1",
        "s1",
        { payFrequency: PayFrequency.MONTHLY, baseRateCents: 50_000_00, effectiveFrom: "2026-09-01" },
        "user-1",
      );

      expect(result.effectiveTo).toBeNull();
      expect(result.supersedesEmploymentId).toBeNull();
      expect(employments.save).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PAYROLL_EMPLOYMENT_CREATED", metadata: expect.objectContaining({ supersedes: null }) }),
        expect.anything(),
      );
    });

    it("closes the currently open version and supersedes it, never editing in place", async () => {
      const open = reloaded({ id: "open-1", effectiveFrom: "2026-01-01", effectiveTo: null, baseRateCents: 40_000_00 });
      vi.mocked(employments.findOne)
        .mockResolvedValueOnce(open)
        .mockResolvedValueOnce(reloaded({ id: "new-1", effectiveFrom: "2026-09-01", supersedesEmploymentId: "open-1" }));

      const result = await service.upsert(
        "tenant-1",
        "s1",
        { payFrequency: PayFrequency.MONTHLY, baseRateCents: 60_000_00, effectiveFrom: "2026-09-01" },
        "user-1",
      );

      // The old row is closed the day before the new one starts, not deleted or overwritten in place.
      expect(employments.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "open-1", effectiveTo: "2026-08-31" }));
      expect(employments.create).toHaveBeenCalledWith(expect.objectContaining({ supersedesEmploymentId: "open-1", baseRateCents: 60_000_00 }));
      expect(result.supersedesEmploymentId).toBe("open-1");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PAYROLL_EMPLOYMENT_SUPERSEDED", metadata: expect.objectContaining({ supersedes: "open-1" }) }),
        expect.anything(),
      );
    });

    it("rejects a new effective date that doesn't come after the currently open version's own start", async () => {
      const open = reloaded({ id: "open-1", effectiveFrom: "2026-09-01", effectiveTo: null });
      vi.mocked(employments.findOne).mockResolvedValueOnce(open);

      await expect(
        service.upsert("tenant-1", "s1", { payFrequency: PayFrequency.MONTHLY, baseRateCents: 60_000_00, effectiveFrom: "2026-09-01" }, "user-1"),
      ).rejects.toMatchObject({ code: "INVALID_EFFECTIVE_DATE" });
      expect(employments.save).not.toHaveBeenCalled();
    });
  });
});
