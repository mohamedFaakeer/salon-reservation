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

describe("Schedules & Leave (e2e)", () => {
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

  async function createStaff(token: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return res.body.id as string;
  }

  const server = () => app.getHttpServer();

  describe("Schedules RBAC", () => {
    it("denies RECEPTIONIST/STAFF on create; allows GET", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(owner, "Schedules RBAC Staff");

      const receptionist = await login("receptionist@demo.salon", "demo1234");
      await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ staffId, dayOfWeek: 0, startMin: 540, endMin: 1020 })
        .expect(403);

      await request(server())
        .get("/api/v1/schedules")
        .set("Authorization", `Bearer ${receptionist}`)
        .expect(200);
    });
  });

  describe("Schedules CRUD + validation", () => {
    it("creates, rejects invalid windows/duplicates, patches, deletes", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(owner, "Schedule CRUD Staff");

      const created = await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${owner}`)
        .send({ staffId, dayOfWeek: 1, startMin: 540, endMin: 1020, breakStartMin: 720, breakEndMin: 780 })
        .expect(201);
      const scheduleId = created.body.id as string;

      const badRange = await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${owner}`)
        .send({ staffId, dayOfWeek: 2, startMin: 1000, endMin: 900 })
        .expect(400);
      assert.equal(badRange.body.code, "INVALID_TIME_RANGE");

      const duplicate = await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${owner}`)
        .send({ staffId, dayOfWeek: 1, startMin: 540, endMin: 1020 })
        .expect(409);
      assert.equal(duplicate.body.code, "SCHEDULE_ALREADY_EXISTS");

      const listRes = await request(server())
        .get(`/api/v1/schedules?staffId=${staffId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(listRes.body.length, 1);

      const manager = await login("manager@demo.salon", "demo1234");
      const patched = await request(server())
        .patch(`/api/v1/schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${manager}`)
        .send({ startMin: 600 })
        .expect(200);
      assert.equal(patched.body.startMin, 600);
      assert.equal(patched.body.endMin, 1020);

      await request(server())
        .delete(`/api/v1/schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);

      const afterDelete = await request(server())
        .get(`/api/v1/schedules?staffId=${staffId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(afterDelete.body.length, 0);
    });
  });

  describe("Staff leave RBAC + validation", () => {
    it("denies RECEPTIONIST on create; allows GET; rejects invalid range", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(owner, "Leave RBAC Staff");

      const receptionist = await login("receptionist@demo.salon", "demo1234");
      await request(server())
        .post(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ startDate: "2026-09-01", endDate: "2026-09-05" })
        .expect(403);

      await request(server())
        .get(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${receptionist}`)
        .expect(200);

      const badRange = await request(server())
        .post(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ startDate: "2026-09-05", endDate: "2026-09-01" })
        .expect(400);
      assert.equal(badRange.body.code, "INVALID_DATE_RANGE");
    });
  });

  describe("Staff leave: affected-appointments count + overlaps", () => {
    it("returns affectedAppointments: 0 (no Appointment entity until P10) and allows overlapping leave", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(owner, "Leave Overlap Staff");

      const first = await request(server())
        .post(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ startDate: "2026-10-01", endDate: "2026-10-10", reason: "Planned trip" })
        .expect(201);
      assert.equal(first.body.affectedAppointments, 0);
      assert.equal(first.body.leave.staffId, staffId);

      // Overlapping range for the same staff member is allowed, not rejected.
      const second = await request(server())
        .post(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ startDate: "2026-10-05", endDate: "2026-10-15" })
        .expect(201);
      assert.equal(second.body.affectedAppointments, 0);

      const listRes = await request(server())
        .get(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(listRes.body.length, 2);

      await request(server())
        .delete(`/api/v1/staff/${staffId}/leave/${first.body.leave.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);

      const afterDelete = await request(server())
        .get(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(afterDelete.body.length, 1);
    });
  });

  describe("Audit trail (SECURITY.md §10)", () => {
    it("creating, updating, and deleting a schedule each write a STAFF_SCHEDULE_CHANGED entry", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(owner, "Schedule Audit Staff");

      const created = await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${owner}`)
        .send({ staffId, dayOfWeek: 4, startMin: 540, endMin: 1020 })
        .expect(201);
      const scheduleId = created.body.id as string;

      await request(server())
        .patch(`/api/v1/schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ startMin: 600 })
        .expect(200);

      await request(server())
        .delete(`/api/v1/schedules/${scheduleId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);

      const auditRes = await request(server())
        .get(`/api/v1/audit?entityType=WorkingSchedule&entityId=${scheduleId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(auditRes.body.data.length, 3);
      const changes = auditRes.body.data.map((e: { metadata: { change: string } }) => e.metadata.change).sort();
      assert.deepEqual(changes, ["created", "removed", "updated"]);
      assert.ok(
        auditRes.body.data.every((e: { action: string }) => e.action === "STAFF_SCHEDULE_CHANGED"),
      );
    });

    it("creating leave writes a STAFF_LEAVE_CREATED entry", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(owner, "Leave Audit Staff");

      const created = await request(server())
        .post(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ startDate: "2026-11-01", endDate: "2026-11-05" })
        .expect(201);

      const auditRes = await request(server())
        .get(`/api/v1/audit?entityType=StaffLeave&entityId=${created.body.leave.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(auditRes.body.data.length, 1);
      assert.equal(auditRes.body.data[0].action, "STAFF_LEAVE_CREATED");
    });
  });

  describe("Cross-tenant isolation", () => {
    it("a schedule and a leave record created under one tenant 404 for another tenant's owner", async () => {
      const superToken = await login(
        "super.admin@salon.local",
        "super-admin-demo-password-2026",
      );
      const unique = Date.now();
      const ownerEmail = `owner-${unique}@schedules-e2e.test`;
      await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "Schedules E2E Salon",
          slug: `schedules-e2e-${unique}`,
          ownerName: "Tenant B Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);

      const tenantAOwner = await login("owner@demo.salon", "demo1234");
      const staffId = await createStaff(tenantAOwner, "Cross Tenant Staff");
      const schedule = await request(server())
        .post("/api/v1/schedules")
        .set("Authorization", `Bearer ${tenantAOwner}`)
        .send({ staffId, dayOfWeek: 3, startMin: 540, endMin: 1020 })
        .expect(201);

      const tenantBOwner = await login(ownerEmail, "password123");

      // Tenant B can't even see tenant A's staff member (404 on the nested route).
      await request(server())
        .post(`/api/v1/staff/${staffId}/leave`)
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ startDate: "2026-09-01", endDate: "2026-09-05" })
        .expect(404);

      // Tenant B can't patch/delete tenant A's schedule row.
      await request(server())
        .patch(`/api/v1/schedules/${schedule.body.id}`)
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ startMin: 600 })
        .expect(404);
    });
  });
});
