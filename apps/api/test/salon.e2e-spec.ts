import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

describe("Salon discovery (e2e) — public, no auth", () => {
  let app: INestApplication;

  before(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function login(email: string, password: string): Promise<string> {
    const res = await request(server()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    return res.body.accessToken as string;
  }

  it("GET /salons lists the demo salon, unauthenticated", async () => {
    const res = await request(server()).get("/api/v1/salons").expect(200);
    const elegance = (res.body as Array<{ slug: string }>).find((s) => s.slug === "elegance");
    assert.ok(elegance, "elegance should be listed");
  });

  it("404s SALON_NOT_FOUND for an unknown slug", async () => {
    const res = await request(server()).get("/api/v1/salons/does-not-exist").expect(404);
    assert.equal(res.body.code, "SALON_NOT_FOUND");
  });

  it("GET /salons/:slug returns the full profile shape, unauthenticated", async () => {
    const res = await request(server()).get("/api/v1/salons/elegance").expect(200);
    assert.equal(res.body.slug, "elegance");
    assert.ok(Array.isArray(res.body.services));
    assert.ok(Array.isArray(res.body.staff));
    assert.ok(Array.isArray(res.body.hours));
    assert.equal(res.body.hours.length, 7);
    assert.ok(typeof res.body.advanceRuleLabel === "string");
    assert.ok(typeof res.body.cancellationPolicySummary === "string");
    assert.ok(Array.isArray(res.body.closures));
  });

  it("only lists active services in the profile", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const active = await request(server())
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Salon Profile Active Service", durationMin: 30, priceCents: 100000 })
      .expect(201);
    const inactive = await request(server())
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Salon Profile Inactive Service", durationMin: 30, priceCents: 100000 })
      .expect(201);
    await request(server())
      .patch(`/api/v1/services/${inactive.body.id}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ active: false })
      .expect(200);

    const res = await request(server()).get("/api/v1/salons/elegance").expect(200);
    const ids = (res.body.services as Array<{ id: string }>).map((s) => s.id);
    assert.ok(ids.includes(active.body.id));
    assert.ok(!ids.includes(inactive.body.id));
  });

  it("only lists upcoming/current closures, not past ones", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 10);
    const futureDate = future.toISOString().slice(0, 10);

    await request(server())
      .post("/api/v1/closures")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Salon Profile Future Closure", startDate: futureDate, endDate: futureDate })
      .expect(201);
    await request(server())
      .post("/api/v1/closures")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Salon Profile Past Closure", startDate: "2020-01-01", endDate: "2020-01-01" })
      .expect(201);

    const res = await request(server()).get("/api/v1/salons/elegance").expect(200);
    const names = (res.body.closures as Array<{ name: string }>).map((c) => c.name);
    assert.ok(names.includes("Salon Profile Future Closure"));
    assert.ok(!names.includes("Salon Profile Past Closure"));
  });

  it("cross-tenant: a suspended/unknown tenant never leaks via the list or profile routes", async () => {
    const superToken = await login("super.admin@salon.local", "super-admin-demo-password-2026");
    const unique = Date.now();
    const slug = `salon-e2e-${unique}`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: "Salon Discovery E2E Salon",
        slug,
        ownerName: "Temp Owner",
        ownerEmail: `owner-${unique}@salon-discovery-e2e.test`,
        ownerPassword: "password123",
      })
      .expect(201);

    const listed = await request(server()).get("/api/v1/salons").expect(200);
    assert.ok((listed.body as Array<{ slug: string }>).some((s) => s.slug === slug));

    const suspendRes = await request(server())
      .get("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    const tenant = (suspendRes.body.data as Array<{ id: string; slug: string }>).find((t) => t.slug === slug);
    assert.ok(tenant);
    await request(server())
      .patch(`/api/v1/tenant/${tenant.id}/status`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ status: "SUSPENDED" })
      .expect(200);

    const listedAfterSuspend = await request(server()).get("/api/v1/salons").expect(200);
    assert.ok(!(listedAfterSuspend.body as Array<{ slug: string }>).some((s) => s.slug === slug));
    await request(server()).get(`/api/v1/salons/${slug}`).expect(404);
  });
});
