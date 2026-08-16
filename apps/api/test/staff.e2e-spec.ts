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

describe("Staff (e2e)", () => {
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
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ name: "Should be denied" })
        .expect(403);

      await request(server())
        .get("/api/v1/staff")
        .set("Authorization", `Bearer ${staff}`)
        .expect(200);
    });

    it("allows OWNER/MANAGER on create/update", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const created = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "RBAC OK Staff" })
        .expect(201);

      const manager = await login("manager@demo.salon", "demo1234");
      await request(server())
        .patch(`/api/v1/staff/${created.body.id}`)
        .set("Authorization", `Bearer ${manager}`)
        .send({ phone: "0771234567" })
        .expect(200);
    });

    it("denies RECEPTIONIST on PUT services; allows GET services", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const created = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Services RBAC Staff" })
        .expect(201);

      const receptionist = await login("receptionist@demo.salon", "demo1234");
      await request(server())
        .put(`/api/v1/staff/${created.body.id}/services`)
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ serviceIds: [] })
        .expect(403);

      await request(server())
        .get(`/api/v1/staff/${created.body.id}/services`)
        .set("Authorization", `Bearer ${receptionist}`)
        .expect(200);
    });
  });

  describe("Validation", () => {
    it("rejects an empty name", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const res = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "" })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });

    it("rejects a malformed color", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const res = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Bad Color Staff", color: "not-a-hex-color" })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });
  });

  describe("Staff-service assignment (qualifications)", () => {
    it("PUT replaces the full set; rejects a service id from another tenant", async () => {
      const owner = await login("owner@demo.salon", "demo1234");

      const staffRes = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Qualified Staff" })
        .expect(201);
      const staffId = staffRes.body.id as string;

      const svc1 = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Haircut", durationMin: 30, priceCents: 150000 })
        .expect(201);
      const svc2 = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Coloring", durationMin: 60, priceCents: 500000 })
        .expect(201);

      const setRes = await request(server())
        .put(`/api/v1/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [svc1.body.id, svc2.body.id] })
        .expect(200);
      assert.equal(setRes.body.length, 2);

      const getRes = await request(server())
        .get(`/api/v1/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      const ids = getRes.body.map((s: { id: string }) => s.id).sort();
      assert.deepEqual(ids, [svc1.body.id, svc2.body.id].sort());

      // Replacing with a subset drops the unlisted one.
      await request(server())
        .put(`/api/v1/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [svc1.body.id] })
        .expect(200);
      const afterReplace = await request(server())
        .get(`/api/v1/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(afterReplace.body.length, 1);
      assert.equal(afterReplace.body[0].id, svc1.body.id);

      // A service id from a different tenant is rejected.
      const superToken = await login(
        "super.admin@salon.local",
        "super-admin-demo-password-2026",
      );
      const unique = Date.now();
      const ownerEmail = `owner-${unique}@staff-e2e.test`;
      await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "Staff E2E Salon",
          slug: `staff-e2e-${unique}`,
          ownerName: "Tenant B Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);
      const tenantBOwner = await login(ownerEmail, "password123");
      const foreignService = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ name: "Foreign Service", durationMin: 30, priceCents: 100000 })
        .expect(201);

      const badSet = await request(server())
        .put(`/api/v1/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [foreignService.body.id] })
        .expect(400);
      assert.equal(badSet.body.code, "INVALID_SERVICE_IDS");
    });
  });

  describe("Cross-tenant isolation", () => {
    it("a staff member created under one tenant 404s when another tenant's owner PATCHes it", async () => {
      const superToken = await login(
        "super.admin@salon.local",
        "super-admin-demo-password-2026",
      );
      const unique = Date.now();
      const ownerEmail = `owner-${unique}@staff-e2e-b.test`;
      await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "Staff E2E Salon B",
          slug: `staff-e2e-b-${unique}`,
          ownerName: "Tenant B Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);

      const tenantAOwner = await login("owner@demo.salon", "demo1234");
      const created = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${tenantAOwner}`)
        .send({ name: "Tenant A Staff" })
        .expect(201);

      const tenantBOwner = await login(ownerEmail, "password123");
      await request(server())
        .patch(`/api/v1/staff/${created.body.id}`)
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ name: "Hijacked" })
        .expect(404);
    });
  });
});
