import type { ObjectLiteral, Repository } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatutoryRuleSetService } from "./statutory-rule-set.service";
import type { StatutoryRuleSet } from "../entities/statutory-rule-set.entity";
import type { UpsertStatutoryRuleSetDto } from "@salon/shared";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function reloaded(overrides: Partial<StatutoryRuleSet> = {}): StatutoryRuleSet {
  return {
    id: "generated-id",
    epfEmployeePercent: 8,
    epfEmployerPercent: 12,
    etfEmployerPercent: 3,
    apitMonthlyFreeThresholdCents: 150_000_00,
    apitBands: [{ uptoCents: 100_000_00, ratePercent: 6 }, { uptoCents: null, ratePercent: 18 }],
    verified: false,
    sourceNote: "Test fixture",
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    createdByUser: { name: "Platform Admin" },
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function dto(overrides: Partial<UpsertStatutoryRuleSetDto> = {}): UpsertStatutoryRuleSetDto {
  return {
    epfEmployeePercent: 8,
    epfEmployerPercent: 12,
    etfEmployerPercent: 3,
    apitMonthlyFreeThresholdCents: 150_000_00,
    apitBands: [{ uptoCents: 100_000_00, ratePercent: 6 }, { uptoCents: null, ratePercent: 18 }],
    effectiveFrom: "2026-09-01",
    sourceNote: "IRD APIT Tax Tables, retrieved 2026-09-03 (test fixture)",
    ...overrides,
  };
}

describe("StatutoryRuleSetService", () => {
  let ruleSets: Repository<StatutoryRuleSet>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: StatutoryRuleSetService;

  beforeEach(() => {
    ruleSets = mockRepo<StatutoryRuleSet>();
    audit = { record: vi.fn(async () => undefined) };
    dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => Promise<unknown>) => cb({ getRepository: () => ruleSets })),
    };
    service = new StatutoryRuleSetService(ruleSets, audit as never, dataSource as never);
  });

  describe("upsert", () => {
    it("rejects a band that isn't the last one being open-ended", async () => {
      await expect(
        service.upsert(dto({ apitBands: [{ uptoCents: null, ratePercent: 6 }, { uptoCents: 100_000_00, ratePercent: 18 }] }), "user-1"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects bands that aren't in strictly ascending order", async () => {
      await expect(
        service.upsert(
          dto({ apitBands: [{ uptoCents: 200_000_00, ratePercent: 6 }, { uptoCents: 100_000_00, ratePercent: 18 }, { uptoCents: null, ratePercent: 24 }] }),
          "user-1",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("publishes the opening version, defaulting verified to false", async () => {
      vi.mocked(ruleSets.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(reloaded());

      const result = await service.upsert(dto(), "user-1");

      expect(result.effectiveTo).toBeNull();
      expect(result.verified).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "STATUTORY_RULE_SET_PUBLISHED" }), expect.anything());
    });

    it("closes the currently open version and supersedes it, never editing in place", async () => {
      const open = reloaded({ id: "open-1", effectiveFrom: "2026-01-01", effectiveTo: null });
      vi.mocked(ruleSets.findOne).mockResolvedValueOnce(open).mockResolvedValueOnce(reloaded({ id: "new-1" }));

      await service.upsert(dto({ effectiveFrom: "2026-09-01" }), "user-1");

      expect(ruleSets.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "open-1", effectiveTo: "2026-08-31" }));
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "STATUTORY_RULE_SET_SUPERSEDED", metadata: expect.objectContaining({ supersedes: "open-1" }) }),
        expect.anything(),
      );
    });

    it("rejects a new effective date that doesn't come after the currently open version's own start", async () => {
      vi.mocked(ruleSets.findOne).mockResolvedValueOnce(reloaded({ effectiveFrom: "2026-09-01", effectiveTo: null }));
      await expect(service.upsert(dto({ effectiveFrom: "2026-09-01" }), "user-1")).rejects.toMatchObject({ code: "INVALID_EFFECTIVE_DATE" });
    });
  });
});
