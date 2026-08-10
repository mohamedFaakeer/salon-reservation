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

// S6 (STAFF calls another staff's appointment mutation → 403) is deferred:
// no Appointment resource exists until P10 (docs/DEVELOPMENT_PLAN.md). Once
// it exists, ownership checks are enforced in the service layer per
// apps/api/src/common/authorization/role-permissions.ts's comment on
// MANAGE_OWN_APPOINTMENT — RolesGuard only proves capability, not ownership.
// See docs/DECISIONS.md (2026-08-11 entry).

describe("RBAC (e2e)", () => {
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

  // S5: RECEPTIONIST calls a manager-only route → 403; OWNER/MANAGER allowed.
  describe("S5 — settings write is OWNER/MANAGER only", () => {
    it("denies RECEPTIONIST", async () => {
      const token = await login("receptionist@demo.salon", "demo1234");
      const res = await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ testFlag: "s5-receptionist" })
        .expect(403);
      assert.equal(res.body.code, "FORBIDDEN");
    });

    it("denies STAFF", async () => {
      const token = await login("staff@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ testFlag: "s5-staff" })
        .expect(403);
    });

    it("allows OWNER (positive control)", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ bookingWindowDays: 30 })
        .expect(200);
    });

    it("allows MANAGER (positive control, proves OWNER/MANAGER parity)", async () => {
      const token = await login("manager@demo.salon", "demo1234");
      await request(server())
        .patch("/api/v1/tenant/me/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ bookingWindowDays: 30 })
        .expect(200);
    });
  });

  describe("SUPER_ADMIN-only enforcement", () => {
    it("denies a tenant OWNER on /super-admin/tenants (POST and GET)", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${token}`)
        .send({
          salonName: "Should Not Provision",
          slug: "should-not-provision",
          ownerName: "Nope",
          ownerEmail: "nope@demo.salon",
          ownerPassword: "password123",
        })
        .expect(403);

      await request(server())
        .get("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("denies a tenant OWNER from suspending their own tenant (regression test for the closed vulnerability)", async () => {
      const token = await login("owner@demo.salon", "demo1234");
      const me = await request(server())
        .get("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const ownTenantId = me.body.tenant.id as string;

      await request(server())
        .patch(`/api/v1/tenant/${ownTenantId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "SUSPENDED" })
        .expect(403);
    });

    it("allows SUPER_ADMIN to list tenants with the {data, meta} pagination envelope", async () => {
      const token = await login("super.admin@salon.local", "super-admin-demo-password-2026");
      const res = await request(server())
        .get("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 1);
      assert.equal(typeof res.body.meta.total, "number");
      assert.equal(res.body.meta.limit, 50);
      assert.equal(res.body.meta.offset, 0);
    });
  });

  describe("Real provisioning flow", () => {
    it("provisions a new tenant end-to-end and proves tenant isolation for the new owner", async () => {
      const superToken = await login(
        "super.admin@salon.local",
        "super-admin-demo-password-2026",
      );
      const unique = Date.now();
      const slug = `rbac-e2e-${unique}`;
      const ownerEmail = `owner-${unique}@rbac-e2e.test`;

      const provision = await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "RBAC E2E Salon",
          slug,
          ownerName: "New Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);
      assert.equal(provision.body.tenant.slug, slug);
      assert.equal(provision.body.owner.email, ownerEmail);

      const newOwnerToken = await login(ownerEmail, "password123");
      const me = await request(server())
        .get("/api/v1/tenant/me")
        .set("Authorization", `Bearer ${newOwnerToken}`)
        .expect(200);
      assert.equal(me.body.tenant.slug, slug);
      assert.notEqual(me.body.tenant.slug, "elegance");

      // The now-guarded status route still works for the authorized role.
      await request(server())
        .patch(`/api/v1/tenant/${provision.body.tenant.id}/status`)
        .set("Authorization", `Bearer ${superToken}`)
        .send({ status: "SUSPENDED" })
        .expect(200);
    });
  });
});
