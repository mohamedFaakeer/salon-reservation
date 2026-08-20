import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

// TokenService requires JWT_SECRET at construction time (compile of AppModule).
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

/** Fresh identifiers per run — this suite provisions real tenants. */
let counter = 0;
function unique(): string {
  counter += 1;
  return `${Date.now()}${counter}`;
}

describe("Demo seed (e2e, P19)", () => {
  let app: INestApplication;

  before(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function login(email: string, password: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(201);
    return res.body.accessToken as string;
  }

  const superAdminToken = () => login("super.admin@salon.local", "super-admin-demo-password-2026");

  /** Provisions an empty tenant and returns its id + slug. */
  async function provision(token: string): Promise<{ id: string; slug: string }> {
    const id = unique();
    const res = await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${token}`)
      .send({
        slug: `seed-test-${id}`,
        salonName: `Seed Test ${id}`,
        ownerName: "Seed Owner",
        ownerEmail: `seed.owner.${id}@example.com`,
        ownerPassword: "SeedOwner123!",
      })
      .expect(201);
    return { id: res.body.tenant.id as string, slug: res.body.tenant.slug as string };
  }

  it("seeds a freshly provisioned tenant with the documented demo data", async () => {
    const token = await superAdminToken();
    const tenant = await provision(token);

    const res = await request(server())
      .post(`/api/v1/super-admin/tenants/${tenant.id}/demo-seed`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    assert.equal(res.body.seeded, true);
    // DEPLOYMENT.md §7 promises these exact volumes.
    assert.equal(res.body.counts.services, 10);
    assert.equal(res.body.counts.staff, 4);
    assert.equal(res.body.counts.customers, 5);
    // Appointments go through the real booking engine against real availability,
    // so assert only that the demo board is non-empty rather than an exact count.
    assert.ok(res.body.counts.appointments > 0, "expected at least one sample appointment");
  });

  it("is idempotent — a second call changes nothing", async () => {
    const token = await superAdminToken();
    const tenant = await provision(token);

    const first = await request(server())
      .post(`/api/v1/super-admin/tenants/${tenant.id}/demo-seed`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    assert.equal(first.body.seeded, true);

    const second = await request(server())
      .post(`/api/v1/super-admin/tenants/${tenant.id}/demo-seed`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    assert.equal(second.body.seeded, false);
    assert.equal(second.body.counts.services, first.body.counts.services);
    assert.equal(second.body.counts.staff, first.body.counts.staff);
    assert.equal(second.body.counts.customers, first.body.counts.customers);
  });

  it("produces a bookable salon — public availability returns slots after seeding", async () => {
    const token = await superAdminToken();
    const tenant = await provision(token);
    await request(server())
      .post(`/api/v1/super-admin/tenants/${tenant.id}/demo-seed`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    // The whole point of the seed is a salon a client can book against on a
    // fresh deploy, so prove it end-to-end through the public customer path.
    const salon = await request(server()).get(`/api/v1/salons/${tenant.slug}`).expect(200);
    const service = salon.body.services[0];
    assert.ok(service, "seeded salon should expose services publicly");

    // Scan forward for an open day (the seed closes Sundays).
    let found = false;
    for (let i = 1; i <= 7 && !found; i += 1) {
      const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
      const res = await request(server())
        .post(`/api/v1/salons/${tenant.slug}/availability`)
        .send({ serviceIds: [service.id], date })
        .expect(200);
      if (res.body.slots.length > 0) {
        found = true;
      }
    }
    assert.ok(found, "seeded salon should have bookable slots within the next week");
  });

  it("rejects a non-super-admin caller", async () => {
    const token = await superAdminToken();
    const tenant = await provision(token);
    const ownerToken = await login("owner@demo.salon", "demo1234");

    await request(server())
      .post(`/api/v1/super-admin/tenants/${tenant.id}/demo-seed`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(403);
  });
});
