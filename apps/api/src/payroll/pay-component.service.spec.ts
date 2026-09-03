import type { ObjectLiteral, Repository } from "typeorm";
import { PayComponentType } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayComponentService } from "./pay-component.service";
import type { EmployeePayComponent } from "../entities/employee-pay-component.entity";
import type { Staff } from "../entities/staff.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function reloaded(overrides: Partial<EmployeePayComponent> = {}): EmployeePayComponent {
  return {
    id: "generated-id",
    staffId: "s1",
    type: PayComponentType.TRANSPORT,
    amountCents: 5_000_00,
    epfApplicable: false,
    etfApplicable: false,
    reason: null,
    active: true,
    staff: { name: "Nadia" },
    createdByUser: { name: "Owner" },
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("PayComponentService", () => {
  let components: Repository<EmployeePayComponent>;
  let staff: Repository<Staff>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: PayComponentService;

  beforeEach(() => {
    components = mockRepo<EmployeePayComponent>();
    staff = mockRepo<Staff>();
    audit = { record: vi.fn(async () => undefined) };
    vi.mocked(staff.findOne).mockResolvedValue({ id: "s1", name: "Nadia" } as Staff);
    service = new PayComponentService(components, staff, audit as never);
  });

  describe("tenant isolation", () => {
    it("list() only ever queries the caller's own tenantId", async () => {
      await service.list("tenant-1", "s1");
      expect(components.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-1", staffId: "s1" } }));
    });

    it("upsert() refuses a staffId belonging to a different tenant, the same as an unknown one", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);
      await expect(
        service.upsert("tenant-1", "another-tenants-staff-id", { type: PayComponentType.TRANSPORT, amountCents: 5_000_00 }, "user-1"),
      ).rejects.toMatchObject({ code: "STAFF_NOT_FOUND" });
      expect(staff.findOne).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", id: "another-tenants-staff-id" } });
    });
  });

  describe("upsert", () => {
    it("rejects an unknown staff member", async () => {
      vi.mocked(staff.findOne).mockResolvedValue(null);
      await expect(
        service.upsert("tenant-1", "ghost", { type: PayComponentType.TRANSPORT, amountCents: 5_000_00 }, "user-1"),
      ).rejects.toMatchObject({ code: "STAFF_NOT_FOUND" });
    });

    it("requires a reason for OTHER_DEDUCTION", async () => {
      await expect(
        service.upsert("tenant-1", "s1", { type: PayComponentType.OTHER_DEDUCTION, amountCents: 1_000_00 }, "user-1"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("does not require a reason for a preset type", async () => {
      vi.mocked(components.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(reloaded());
      await expect(
        service.upsert("tenant-1", "s1", { type: PayComponentType.TRANSPORT, amountCents: 5_000_00 }, "user-1"),
      ).resolves.toBeDefined();
    });

    it("defaults epfApplicable/etfApplicable to false when omitted", async () => {
      vi.mocked(components.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(reloaded());
      await service.upsert("tenant-1", "s1", { type: PayComponentType.TRANSPORT, amountCents: 5_000_00 }, "user-1");
      expect(components.create).toHaveBeenCalledWith(expect.objectContaining({ epfApplicable: false, etfApplicable: false }));
    });

    it("deactivates an existing active component of the same type rather than leaving two active", async () => {
      const existing = reloaded({ id: "existing-1" });
      vi.mocked(components.findOne).mockResolvedValueOnce(existing).mockResolvedValueOnce(reloaded({ id: "new-1" }));

      await service.upsert("tenant-1", "s1", { type: PayComponentType.TRANSPORT, amountCents: 6_000_00 }, "user-1");

      expect(components.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "existing-1", active: false }));
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "PAY_COMPONENT_UPDATED" }));
    });
  });

  describe("deactivate", () => {
    it("refuses an already-inactive component", async () => {
      vi.mocked(components.findOne).mockResolvedValue(reloaded({ active: false }));
      await expect(service.deactivate("tenant-1", "comp-1", "user-1")).rejects.toMatchObject({
        code: "PAY_COMPONENT_ALREADY_INACTIVE",
      });
    });
  });

  describe("activeLines", () => {
    it("derives kind from type and only returns active rows", async () => {
      vi.mocked(components.find).mockResolvedValue([
        reloaded({ type: PayComponentType.TRANSPORT, amountCents: 5_000_00 }),
        reloaded({ type: PayComponentType.LOAN_REPAYMENT, amountCents: 3_000_00 }),
      ]);
      const lines = await service.activeLines("tenant-1", "s1");
      expect(lines).toEqual([
        { type: PayComponentType.TRANSPORT, kind: "ALLOWANCE", amountCents: 5_000_00, epfApplicable: false, etfApplicable: false },
        { type: PayComponentType.LOAN_REPAYMENT, kind: "DEDUCTION", amountCents: 3_000_00, epfApplicable: false, etfApplicable: false },
      ]);
      expect(components.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-1", staffId: "s1", active: true } }));
    });
  });
});
