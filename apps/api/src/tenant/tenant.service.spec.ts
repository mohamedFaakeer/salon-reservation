import type { ObjectLiteral, Repository } from "typeorm";
import { DEFAULT_TENANT_SETTINGS } from "@salon/shared";
import { TenantService } from "./tenant.service";
import type { Tenant } from "../entities/tenant.entity";
import type { CloudinaryService } from "../cloudinary/cloudinary.service";

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
    customerBookingEnabled: true,
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
    const cloudinary = { uploadLogo: vi.fn() } as unknown as CloudinaryService;
    service = new TenantService(tenants, cloudinary);
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

describe("TenantService — backfilling settings keys added after a tenant was created", () => {
  let tenants: Repository<Tenant>;
  let service: TenantService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    const cloudinary = { uploadLogo: vi.fn() } as unknown as CloudinaryService;
    service = new TenantService(tenants, cloudinary);
  });

  /**
   * A tenant's `settings` JSONB is only ever written by `createTenant` (a
   * full snapshot at that moment) or `updateSettings` (a merge onto whatever
   * was already there) — nothing reconciles an existing row against a newer
   * `DEFAULT_TENANT_SETTINGS` shape. Simulates a tenant created before
   * `customerSegmentSettings`/`customTitleOptions`/`customClientSourceOptions`
   * existed by stripping them from the stored settings entirely.
   */
  function preExistingTenantSettings(): Partial<typeof DEFAULT_TENANT_SETTINGS> {
    const rest: Partial<typeof DEFAULT_TENANT_SETTINGS> = { ...DEFAULT_TENANT_SETTINGS };
    delete rest.customerSegmentSettings;
    delete rest.customTitleOptions;
    delete rest.customClientSourceOptions;
    return rest;
  }

  it("getSettings backfills customerSegmentSettings for a tenant whose stored settings predate the feature", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(
      baseTenant({ settings: preExistingTenantSettings() as never }),
    );

    const settings = await service.getSettings("tenant-1");

    expect(settings.customerSegmentSettings).toEqual(DEFAULT_TENANT_SETTINGS.customerSegmentSettings);
    expect(settings.customTitleOptions).toEqual([]);
    expect(settings.customClientSourceOptions).toEqual([]);
  });

  it("updateSettings backfills the missing keys too, so a patch to an unrelated field doesn't wipe them", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(
      baseTenant({ settings: preExistingTenantSettings() as never }),
    );

    const result = await service.updateSettings("tenant-1", { businessRegNo: "PV12345" });

    expect(result.customerSegmentSettings).toEqual(DEFAULT_TENANT_SETTINGS.customerSegmentSettings);
  });

  it("a partial customerSegmentSettings patch deep-merges onto the existing value, same as cancellationPolicy already does", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

    const result = await service.updateSettings("tenant-1", {
      customerSegmentSettings: { newCustomerWindowDays: 45 },
    });

    expect(result.customerSegmentSettings).toEqual({
      ...DEFAULT_TENANT_SETTINGS.customerSegmentSettings,
      newCustomerWindowDays: 45,
    });
  });
});

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

describe("TenantService.uploadLogo — the four constraints, in order", () => {
  let tenants: Repository<Tenant>;
  let cloudinary: CloudinaryService;
  let service: TenantService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    cloudinary = { uploadLogo: vi.fn(async () => "https://res.cloudinary.com/demo/logo.png") } as unknown as CloudinaryService;
    service = new TenantService(tenants, cloudinary);
    vi.mocked(tenants.findOne).mockResolvedValue(baseTenant());
  });

  it("refuses a file over 1MB before ever looking at its content", async () => {
    const oversized = Buffer.alloc(1_000_001);
    await expect(service.uploadLogo("tenant-1", oversized)).rejects.toMatchObject({
      code: "LOGO_FILE_TOO_LARGE",
    });
    expect(cloudinary.uploadLogo).not.toHaveBeenCalled();
  });

  it("refuses a buffer that isn't a real PNG/JPEG/WebP, regardless of what a client claimed", async () => {
    await expect(service.uploadLogo("tenant-1", Buffer.from("not an image"))).rejects.toMatchObject({
      code: "LOGO_INVALID_FILE_TYPE",
    });
  });

  it("refuses an image smaller than 200x200", async () => {
    await expect(service.uploadLogo("tenant-1", pngBuffer(120, 120))).rejects.toMatchObject({
      code: "LOGO_DIMENSIONS_OUT_OF_RANGE",
    });
  });

  it("refuses an image larger than 4000x4000", async () => {
    await expect(service.uploadLogo("tenant-1", pngBuffer(5000, 5000))).rejects.toMatchObject({
      code: "LOGO_DIMENSIONS_OUT_OF_RANGE",
    });
  });

  it("refuses a banner-shaped image outside 2:1", async () => {
    await expect(service.uploadLogo("tenant-1", pngBuffer(1000, 300))).rejects.toMatchObject({
      code: "LOGO_ASPECT_RATIO_INVALID",
    });
  });

  it("accepts a valid square-ish logo and saves the returned URL onto tenant.settings", async () => {
    const settings = await service.uploadLogo("tenant-1", pngBuffer(512, 512));
    expect(settings.logoUrl).toBe("https://res.cloudinary.com/demo/logo.png");
    expect(cloudinary.uploadLogo).toHaveBeenCalledWith(expect.any(Buffer), "salon-logos/eagle");
    expect(tenants.save).toHaveBeenCalled();
  });
});

describe("TenantService.findActiveBySlug — shared by the salon profile page and booking creation", () => {
  let tenants: Repository<Tenant>;
  let service: TenantService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    const cloudinary = { uploadLogo: vi.fn() } as unknown as CloudinaryService;
    service = new TenantService(tenants, cloudinary);
  });

  it("returns the tenant when active and visible to customers", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

    await expect(service.findActiveBySlug("eagle")).resolves.toMatchObject({ slug: "eagle" });
  });

  it("404s a slug that doesn't match an ACTIVE tenant — unknown and suspended read identically", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(null);

    await expect(service.findActiveBySlug("nope")).rejects.toMatchObject({
      statusCode: 404,
      code: "SALON_NOT_FOUND",
    });
  });

  it("rejects with a distinct code when the salon exists and is active but a platform admin deactivated customer bookings", async () => {
    vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ customerBookingEnabled: false }));

    await expect(service.findActiveBySlug("eagle")).rejects.toMatchObject({
      statusCode: 403,
      code: "SALON_BOOKING_DISABLED",
    });
  });
});
