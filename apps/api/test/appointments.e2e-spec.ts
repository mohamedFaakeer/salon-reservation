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

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

function inWindowDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Unique phone per run — the DB is persistent across e2e runs, so fixed numbers would collide. */
let phoneCounter = 0;
function uniquePhone(): string {
  const suffix = `${Date.now()}${phoneCounter++}`.slice(-8);
  return `077${suffix}`;
}

describe("Appointments (e2e) — receptionist flow, lifecycle, S6, cross-tenant", () => {
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

  async function login(email: string, password: string): Promise<{ token: string; userId: string }> {
    const res = await request(server()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string };
  }

  async function createStaff(token: string, name: string, userId?: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send(userId ? { name, userId } : { name })
      .expect(201);
    return res.body.id as string;
  }

  async function createService(token: string, name: string, durationMin: number): Promise<string> {
    const res = await request(server())
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${token}`)
      .send({ name, durationMin, priceCents: 500000 })
      .expect(201);
    return res.body.id as string;
  }

  async function assignServices(token: string, staffId: string, serviceIds: string[]): Promise<void> {
    await request(server())
      .put(`/api/v1/staff/${staffId}/services`)
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceIds })
      .expect(200);
  }

  async function createSchedule(token: string, staffId: string, dayOfWeek: number): Promise<void> {
    // The S6 test reuses the demo-seeded staff row, whose schedule may already exist
    // from a previous e2e run against the persistent DB — tolerate that.
    const existing = await request(server())
      .get(`/api/v1/schedules?staffId=${staffId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const already = (existing.body as Array<{ staffId: string; dayOfWeek: number }>).some(
      (s) => s.staffId === staffId && s.dayOfWeek === dayOfWeek,
    );
    if (already) {
      return;
    }
    await request(server())
      .post("/api/v1/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({ staffId, dayOfWeek, startMin: 540, endMin: 1020 })
      .expect(201);
  }

  /** Finds the Staff row already linked to this user (demo seed), or links a fresh one. */
  async function resolveOrLinkStaffId(owner: string, userId: string, name: string): Promise<string> {
    const listRes = await request(server())
      .get("/api/v1/staff")
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    const existing = (listRes.body as Array<{ id: string; userId: string | null }>).find(
      (s) => s.userId === userId,
    );
    if (existing) {
      return existing.id;
    }
    return createStaff(owner, name, userId);
  }

  async function bookableFixture(
    owner: string,
    namePrefix: string,
    staffId?: string,
  ): Promise<{ staffId: string; serviceId: string; date: string; slotStart: string }> {
    const resolvedStaffId = staffId ?? (await createStaff(owner, `${namePrefix} Staff`));
    const serviceId = await createService(owner, `${namePrefix} Service`, 30);
    await assignServices(owner, resolvedStaffId, [serviceId]);
    const date = inWindowDate(2);
    await createSchedule(owner, resolvedStaffId, dayOfWeekOf(date));

    const availRes = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date, staffId: resolvedStaffId })
      .expect(200);
    return { staffId: resolvedStaffId, serviceId, date, slotStart: availRes.body.slots[0].start as string };
  }

  it("denies STAFF from creating an appointment; RECEPTIONIST is allowed", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const staffLogin = await login("staff@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Appt RBAC Create");

    await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${staffLogin.token}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Walk", lastName: "In", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(403);

    const receptionist = (await login("receptionist@demo.salon", "demo1234")).token;
    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${receptionist}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Walk", lastName: "In", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(201);
    assert.equal(res.body.status, "CONFIRMED");
    assert.equal(res.body.source, "WALK_IN");
  });

  it("rejects a create call without a valid Idempotency-Key header", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Appt Missing Key");

    await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .send({
        newCustomer: { firstName: "A", lastName: "B", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(400);
  });

  it("requires exactly one of customerId/newCustomer", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Appt Neither Customer");

    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ serviceIds: [serviceId], staffId, start: slotStart, source: "WALK_IN" })
      .expect(400);
    assert.equal(res.body.code, "VALIDATION_ERROR");
  });

  it("checks the appointment straight in when checkInNow is set", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Appt CheckInNow");

    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Prompt", lastName: "Arrival", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "PHONE",
        checkInNow: true,
      })
      .expect(201);
    assert.equal(res.body.status, "CHECKED_IN");
    assert.ok(res.body.checkedInAt);
  });

  it("full lifecycle: create -> check-in -> in-service -> complete", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Appt Lifecycle");

    const created = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Life", lastName: "Cycle", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "PHONE",
      })
      .expect(201);
    const id = created.body.id as string;

    const checkedIn = await request(server())
      .post(`/api/v1/appointments/${id}/check-in`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.equal(checkedIn.body.status, "CHECKED_IN");

    const inService = await request(server())
      .post(`/api/v1/appointments/${id}/in-service`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.equal(inService.body.status, "IN_SERVICE");

    const completed = await request(server())
      .post(`/api/v1/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.equal(completed.body.status, "COMPLETED");
    assert.ok(completed.body.completedAt);

    // Out-of-order transitions are rejected.
    await request(server())
      .post(`/api/v1/appointments/${id}/check-in`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(400);
  });

  it("lists appointments filtered by date and staffId", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const { serviceId, staffId, slotStart, date } = await bookableFixture(owner, "Appt List");

    await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "List", lastName: "Me", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(201);

    const listRes = await request(server())
      .get(`/api/v1/appointments?date=${date}&staffId=${staffId}`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.ok(listRes.body.data.length >= 1);
    assert.ok(listRes.body.data.every((a: { staffId: string }) => a.staffId === staffId));
  });

  it("S6: a STAFF member may act on their own appointment but not another's", async () => {
    const owner = (await login("owner@demo.salon", "demo1234")).token;
    const staffLogin = await login("staff@demo.salon", "demo1234");
    const myStaffId = await resolveOrLinkStaffId(owner, staffLogin.userId, "S6 My Staff");
    const { serviceId: myServiceId, staffId: myStaff, slotStart: myStart } = await bookableFixture(
      owner,
      "S6 Mine",
      myStaffId,
    );
    const otherFixture = await bookableFixture(owner, "S6 Other");

    const mine = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Own", lastName: "Customer", phone: uniquePhone() },
        serviceIds: [myServiceId],
        staffId: myStaff,
        start: myStart,
        source: "WALK_IN",
        checkInNow: true,
      })
      .expect(201);

    const others = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Other", lastName: "Customer", phone: uniquePhone() },
        serviceIds: [otherFixture.serviceId],
        staffId: otherFixture.staffId,
        start: otherFixture.slotStart,
        source: "WALK_IN",
        checkInNow: true,
      })
      .expect(201);

    // Own appointment: findOne + in-service both succeed.
    await request(server())
      .get(`/api/v1/appointments/${mine.body.id}`)
      .set("Authorization", `Bearer ${staffLogin.token}`)
      .expect(200);
    await request(server())
      .post(`/api/v1/appointments/${mine.body.id}/in-service`)
      .set("Authorization", `Bearer ${staffLogin.token}`)
      .expect(200);

    // Another staff member's appointment: 403 on both read and mutate.
    await request(server())
      .get(`/api/v1/appointments/${others.body.id}`)
      .set("Authorization", `Bearer ${staffLogin.token}`)
      .expect(403);
    await request(server())
      .post(`/api/v1/appointments/${others.body.id}/in-service`)
      .set("Authorization", `Bearer ${staffLogin.token}`)
      .expect(403);
  });

  it("cross-tenant: an appointment created under one tenant 404s for another tenant's owner", async () => {
    const superToken = (await login("super.admin@salon.local", "super-admin-demo-password-2026")).token;
    const unique = Date.now();
    const ownerEmail = `owner-${unique}@appointments-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: "Appointments E2E Salon",
        slug: `appointments-e2e-${unique}`,
        ownerName: "Tenant B Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);

    const tenantAOwner = (await login("owner@demo.salon", "demo1234")).token;
    const { serviceId, staffId, slotStart } = await bookableFixture(tenantAOwner, "Appt Cross Tenant");
    const created = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${tenantAOwner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Cross", lastName: "Tenant", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(201);

    const tenantBOwner = (await login(ownerEmail, "password123")).token;
    await request(server())
      .get(`/api/v1/appointments/${created.body.id}`)
      .set("Authorization", `Bearer ${tenantBOwner}`)
      .expect(404);
  });
});
