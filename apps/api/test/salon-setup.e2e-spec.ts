import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

// TokenService requires JWT_SECRET at construction time (compile of AppModule).
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

describe("Salon setup (e2e)", () => {
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

  describe("Settings validation", () => {
    it("rejects an invalid advanceRule enum value", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      const res = await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ advanceRule: "NOT_A_REAL_ENUM" })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });

    it("rejects an out-of-range cancellationPolicy percent", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      const res = await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ cancellationPolicy: { refundPercentBeforeCutoff: 150 } })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });

    it("rejects an unknown top-level key (forbidNonWhitelisted)", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      const res = await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ notARealField: "bar" })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });
  });

  describe("Settings/profile/branch RBAC", () => {
    it("denies RECEPTIONIST and STAFF on profile + branch writes", async () => {
      const receptionist = await login("receptionist@demo.salon", "demo1234");
      const staff = await login("staff@demo.salon", "demo1234");

      await request(server())
        .patch("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ name: "Should Not Rename" })
        .expect(403);

      await request(server())
        .patch("/api/v1/tenant/me/branch")
        .set("Authorization", `Bearer ${staff}`)
        .send({ name: "Should Not Rename Branch" })
        .expect(403);
    });

    it("allows OWNER/MANAGER on profile + branch writes", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: "Elegance Salon" })
        .expect(200);

      const manager = await login("manager@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me/branch")
        .set("Authorization", `Bearer ${manager}`)
        .send({ phone: "0771234567" })
        .expect(200);
    });
  });

  describe("Settings round-trip", () => {
    it("PATCH then GET reflects the change; other defaults remain intact", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ bookingWindowDays: 45 })
        .expect(200);

      const res = await request(server())
        .get("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      assert.equal(res.body.bookingWindowDays, 45);
      assert.equal(res.body.noShowGraceMinutes, 15);
    });
  });

  describe("Profile round-trip", () => {
    it("PATCH then GET reflects the new name; slug is unchanged", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      const before = await request(server())
        .get("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const slug = before.body.tenant.slug as string;

      await request(server())
        .patch("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Elegance Salon Renamed" })
        .expect(200);

      const after = await request(server())
        .get("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      assert.equal(after.body.tenant.name, "Elegance Salon Renamed");
      assert.equal(after.body.tenant.slug, slug);
    });
  });

  describe("Branch round-trip", () => {
    it("GET is readable by any authenticated role; OWNER PATCH is reflected", async () => {
      const staffToken = await login("staff@demo.salon", "demo1234");
      const initial = await request(server())
        .get("/api/v1/tenant/me/branch")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(200);
      assert.equal(initial.body.name, "Main Branch");

      const ownerToken = await login("owner@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me/branch")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ address: "123 Galle Road, Colombo" })
        .expect(200);

      const after = await request(server())
        .get("/api/v1/tenant/me/branch")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(200);
      assert.equal(after.body.address, "123 Galle Road, Colombo");
    });
  });

  describe("Closure CRUD", () => {
    it("create (valid), reject (invalid range), list, RBAC-gate, delete, 404 on redelete", async () => {
      const ownerToken = await login("owner@demo.salon", "demo1234");

      const badRange = await request(server())
        .post("/api/v1/closures")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ startDate: "2026-12-25", endDate: "2026-12-20", name: "Bad range" })
        .expect(400);
      assert.equal(badRange.body.code, "INVALID_DATE_RANGE");

      const receptionistToken = await login("receptionist@demo.salon", "demo1234");
      await request(server())
        .post("/api/v1/closures")
        .set("Authorization", `Bearer ${receptionistToken}`)
        .send({ startDate: "2026-12-25", endDate: "2026-12-25", name: "Should be denied" })
        .expect(403);

      const created = await request(server())
        .post("/api/v1/closures")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ startDate: "2026-12-25", endDate: "2026-12-26", name: "Christmas" })
        .expect(201);
      const closureId = created.body.id as string;

      const staffToken = await login("staff@demo.salon", "demo1234");
      const list = await request(server())
        .get("/api/v1/closures")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(200);
      assert.ok(list.body.some((c: { id: string }) => c.id === closureId));

      await request(server())
        .delete(`/api/v1/closures/${closureId}`)
        .set("Authorization", `Bearer ${receptionistToken}`)
        .expect(403);

      await request(server())
        .delete(`/api/v1/closures/${closureId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);

      const listAfter = await request(server())
        .get("/api/v1/closures")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(200);
      assert.ok(!listAfter.body.some((c: { id: string }) => c.id === closureId));

      await request(server())
        .delete(`/api/v1/closures/${closureId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(404);
    });

    it("blocks cross-tenant delete: a closure is invisible (404, not 403) to another tenant's OWNER", async () => {
      const superToken = await login(
        "super.admin@salon.local",
        "super-admin-demo-password-2026",
      );
      const unique = Date.now();
      const slug = `salon-setup-e2e-${unique}`;
      const ownerEmail = `owner-${unique}@salon-setup-e2e.test`;

      const provision = await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "Salon Setup E2E Salon",
          slug,
          ownerName: "Tenant B Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);
      assert.equal(provision.body.tenant.slug, slug);

      const tenantAOwnerToken = await login("owner@demo.salon", "demo1234");
      const created = await request(server())
        .post("/api/v1/closures")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({ startDate: "2026-11-01", endDate: "2026-11-01", name: "Tenant A closure" })
        .expect(201);
      const closureId = created.body.id as string;

      const tenantBOwnerToken = await login(ownerEmail, "password123");
      await request(server())
        .delete(`/api/v1/closures/${closureId}`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`)
        .expect(404);

      const stillThere = await request(server())
        .get("/api/v1/closures")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .expect(200);
      assert.ok(stillThere.body.some((c: { id: string }) => c.id === closureId));
    });
  });
});
