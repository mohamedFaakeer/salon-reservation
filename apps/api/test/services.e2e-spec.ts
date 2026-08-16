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

describe("Services (e2e)", () => {
  let app: INestApplication;

  before(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(201);
    return res.body.accessToken as string;
  }

  const server = () => app.getHttpServer();

  describe("RBAC", () => {
    it("denies RECEPTIONIST and STAFF on create/update; allows GET", async () => {
      const receptionist = await login("receptionist@demo.salon", "demo1234");
      const staff = await login("staff@demo.salon", "demo1234");

      await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ name: "Should be denied", durationMin: 30, priceCents: 100000 })
        .expect(403);

      await request(server())
        .get("/api/v1/services")
        .set("Authorization", `Bearer ${staff}`)
        .expect(200);
    });

    it("allows OWNER/MANAGER on create/update", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const created = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "RBAC OK Service", durationMin: 30, priceCents: 100000 })
        .expect(201);

      const manager = await login("manager@demo.salon", "demo1234");
      await request(server())
        .patch(`/api/v1/services/${created.body.id}`)
        .set("Authorization", `Bearer ${manager}`)
        .send({ category: "Hair" })
        .expect(200);
    });

    it("denies RECEPTIONIST and STAFF on GET /audit; allows OWNER/MANAGER", async () => {
      const receptionist = await login("receptionist@demo.salon", "demo1234");
      await request(server())
        .get("/api/v1/audit")
        .set("Authorization", `Bearer ${receptionist}`)
        .expect(403);

      const owner = await login("owner@demo.salon", "demo1234");
      await request(server())
        .get("/api/v1/audit")
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
    });
  });

  describe("Validation", () => {
    it("rejects durationMin <= 0 and negative priceCents", async () => {
      const owner = await login("owner@demo.salon", "demo1234");

      const badDuration = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Bad Duration", durationMin: 0, priceCents: 1000 })
        .expect(400);
      assert.equal(badDuration.body.code, "VALIDATION_ERROR");

      const badPrice = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Bad Price", durationMin: 30, priceCents: -1 })
        .expect(400);
      assert.equal(badPrice.body.code, "VALIDATION_ERROR");
    });
  });

  describe("Audit trail end-to-end", () => {
    it("PATCH price writes one SERVICE_PRICE_CHANGED entry; active-only PATCH does not", async () => {
      const owner = await login("owner@demo.salon", "demo1234");

      const created = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Audited Service", durationMin: 30, priceCents: 200000 })
        .expect(201);
      const serviceId = created.body.id as string;

      await request(server())
        .patch(`/api/v1/services/${serviceId}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ priceCents: 250000 })
        .expect(200);

      const afterPriceChange = await request(server())
        .get(`/api/v1/audit?entityType=Service&entityId=${serviceId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(afterPriceChange.body.data.length, 1);
      assert.equal(afterPriceChange.body.data[0].action, "SERVICE_PRICE_CHANGED");
      assert.equal(afterPriceChange.body.data[0].metadata.priceCentsBefore, 200000);
      assert.equal(afterPriceChange.body.data[0].metadata.priceCentsAfter, 250000);

      await request(server())
        .patch(`/api/v1/services/${serviceId}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ active: false })
        .expect(200);

      const afterActiveToggle = await request(server())
        .get(`/api/v1/audit?entityType=Service&entityId=${serviceId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(afterActiveToggle.body.data.length, 1);
    });
  });

  describe("Cross-tenant isolation", () => {
    it("a service created under one tenant 404s when another tenant's owner PATCHes it", async () => {
      const superToken = await login(
        "super.admin@salon.local",
        "super-admin-demo-password-2026",
      );
      const unique = Date.now();
      const ownerEmail = `owner-${unique}@services-e2e.test`;
      await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "Services E2E Salon",
          slug: `services-e2e-${unique}`,
          ownerName: "Tenant B Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);

      const tenantAOwner = await login("owner@demo.salon", "demo1234");
      const created = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${tenantAOwner}`)
        .send({ name: "Tenant A Service", durationMin: 30, priceCents: 150000 })
        .expect(201);

      const tenantBOwner = await login(ownerEmail, "password123");
      await request(server())
        .patch(`/api/v1/services/${created.body.id}`)
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ priceCents: 999999 })
        .expect(404);
    });
  });
});
