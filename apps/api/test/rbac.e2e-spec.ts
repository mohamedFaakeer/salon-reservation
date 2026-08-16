import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";
import { dayOfWeekOf } from "../src/availability/time.util";

// TokenService requires JWT_SECRET at construction time (compile of AppModule).
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

// S6 (STAFF calls another staff's appointment mutation → 403) is covered in
// apps/api/test/appointments.e2e-spec.ts ("S6: a STAFF member may act on
// their own appointment but not another's"), not here — that spec already
// owns the Appointment fixtures and lifecycle setup this scenario needs.
// Ownership is enforced in the service layer per
// apps/api/src/common/authorization/role-permissions.ts's comment on
// MANAGE_OWN_APPOINTMENT — RolesGuard only proves capability, not ownership.

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

      // P6: provisioning is now audited (closes the P4-tracked gap). Checked
      // before suspension below, since a suspended tenant correctly blocks
      // all further access for its own owner.
      const auditRes = await request(server())
        .get(`/api/v1/audit?entityType=Tenant&entityId=${provision.body.tenant.id}`)
        .set("Authorization", `Bearer ${newOwnerToken}`)
        .expect(200);
      assert.equal(auditRes.body.data.length, 1);
      assert.equal(auditRes.body.data[0].action, "TENANT_PROVISIONED");

      // The now-guarded status route still works for the authorized role.
      await request(server())
        .patch(`/api/v1/tenant/${provision.body.tenant.id}/status`)
        .set("Authorization", `Bearer ${superToken}`)
        .send({ status: "SUSPENDED" })
        .expect(200);
    });
  });

  /**
   * P17 gap closure — S3/S4 (forged tenantId/price) and S12 (extra field /
   * over-length string) weren't adversarially exercised anywhere: booking
   * DTOs simply have no `tenantId`/price field to begin with, so
   * `forbidNonWhitelisted` was trusted but never actually proven against an
   * attacker-supplied one.
   */
  describe("S3/S4/S12 — forged fields and oversized input are rejected, never silently dropped or trusted", () => {
    function inWindowDate(daysAhead: number): string {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + daysAhead);
      return d.toISOString().slice(0, 10);
    }

    /** Unique per call — the dev DB is persistent across e2e runs, so fixed numbers collide. */
    let phoneCounter = 0;
    function uniquePhone(): string {
      const suffix = `${Date.now()}${phoneCounter++}`.slice(-8);
      return `077${suffix}`;
    }

    async function bookableFixture(
      owner: string,
      namePrefix: string,
    ): Promise<{ staffId: string; serviceId: string; slotStart: string }> {
      const staffId = await request(server())
        .post("/api/v1/staff")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: `${namePrefix} Staff` })
        .expect(201)
        .then((r) => r.body.id as string);
      const serviceId = await request(server())
        .post("/api/v1/services")
        .set("Authorization", `Bearer ${owner}`)
        .send({ name: `${namePrefix} Service`, durationMin: 30, priceCents: 500000 })
        .expect(201)
        .then((r) => r.body.id as string);
      await request(server())
        .put(`/api/v1/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [serviceId] })
        .expect(200);
      const date = inWindowDate(2);
      await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${owner}`)
        .send({ staffId, dayOfWeek: dayOfWeekOf(date), startMin: 540, endMin: 1020 })
        .expect(201);
      const availRes = await request(server())
        .post("/api/v1/salons/elegance/availability")
        .send({ serviceIds: [serviceId], date, staffId })
        .expect(200);
      return { staffId, serviceId, slotStart: availRes.body.slots[0].start as string };
    }

    it("S3: a forged tenantId in a public booking body is rejected, not silently ignored or trusted", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const { staffId, serviceId, slotStart } = await bookableFixture(owner, "S3 Forged Tenant");

      const res = await request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          customer: { firstName: "Forged", lastName: "Tenant", phone: uniquePhone() },
          tenantId: "11111111-1111-4111-8111-111111111111",
        })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });

    it("S4: a forged price field in a public booking body is rejected — price is always server-computed", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const { staffId, serviceId, slotStart } = await bookableFixture(owner, "S4 Forged Price");

      const res = await request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          customer: { firstName: "Forged", lastName: "Price", phone: uniquePhone() },
          totalCents: 1,
        })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });

    it("S12: an arbitrary unwhitelisted extra field on an otherwise-valid DTO is rejected", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const { staffId, serviceId, slotStart } = await bookableFixture(owner, "S12 Extra Field");

      const res = await request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          customer: { firstName: "Extra", lastName: "Field", phone: uniquePhone() },
          isAdmin: true,
        })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });

    it("S12: a string exceeding an @MaxLength constraint is rejected", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const { staffId, serviceId, slotStart } = await bookableFixture(owner, "S12 Long String");
      const appointment = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Long", lastName: "Reason", phone: uniquePhone() },
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          source: "WALK_IN",
        })
        .expect(201);

      // CancelAppointmentDto.reason is @MaxLength(500).
      const res = await request(server())
        .post(`/api/v1/appointments/${appointment.body.id}/cancel`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "x".repeat(501) })
        .expect(400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });
  });
});
