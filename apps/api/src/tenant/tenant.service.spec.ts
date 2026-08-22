import type { ObjectLiteral, Repository } from "typeorm";
import { DEFAULT_TENANT_SETTINGS } from "@salon/shared";
import { TenantService } from "./tenant.service";
import type { Tenant } from "../entities/tenant.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    slug: "eagle",
    name: "Eagle Salon",
    status: "ACTIVE",
    currency: "LKR",
    timezone: "Asia/Colombo",
    settings: DEFAULT_TENANT_SETTINGS,
    entitlements: { tier: "PRO", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: {} },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("TenantService.updateSettings — plan ceilings", () => {
  let tenants: Repository<Tenant>;
  let service: TenantService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    service = new TenantService(tenants);
  });

  it("allows a PRO tenant any booking window, since PRO sets no ceiling", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

    await expect(
      service.updateSettings("tenant-1", { bookingWindowDays: 365 }),
    ).resolves.toMatchObject({ bookingWindowDays: 365 });
  });

  it("refuses a booking window past a LITE tenant's ceiling", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(
      baseTenant({ entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: {} } }),
    );

    await expect(
      service.updateSettings("tenant-1", { bookingWindowDays: 30 }),
    ).rejects.toMatchObject({ statusCode: 400, code: "SETTING_EXCEEDS_PLAN_LIMIT" });
  });

  it("refuses more reminder offsets than the plan allows", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(
      baseTenant({ entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: {} } }),
    );

    await expect(
      service.updateSettings("tenant-1", { reminderOffsets: [1440, 120] }),
    ).rejects.toMatchObject({ statusCode: 400, code: "SETTING_EXCEEDS_PLAN_LIMIT" });
  });

  it("refuses a discount cap past the plan's ceiling", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(
      baseTenant({ entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: {} } }),
    );

    await expect(
      service.updateSettings("tenant-1", { discountCapPercent: 25 }),
    ).rejects.toMatchObject({ statusCode: 400, code: "SETTING_EXCEEDS_PLAN_LIMIT" });
  });

  it("an explicit per-tenant override raises the ceiling past the tier default", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(
      baseTenant({
        entitlements: {
          tier: "LITE",
          moduleOverrides: {},
          reportPanelOverrides: {},
          limitOverrides: { maxBookingWindowDays: 60 },
        },
      }),
    );

    await expect(
      service.updateSettings("tenant-1", { bookingWindowDays: 45 }),
    ).resolves.toMatchObject({ bookingWindowDays: 45 });
  });
});
