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

  async function createService(token: string, name: string, durationMin: number, priceCents = 500000): Promise<string> {
    const res = await request(server())
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${token}`)
      .send({ name, durationMin, priceCents })
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

    // A caller-provided staffId (e.g. the shared demo-linked "S6" staff row)
    // can accumulate enough bookings across repeated local runs against the
    // persistent dev DB that its default day fills up — scan forward for a
    // free one instead of assuming inWindowDate(2) always has room. A fresh
    // staff row (the common case) always succeeds on the first iteration.
    for (let daysAhead = 2; daysAhead <= 9; daysAhead++) {
      const date = inWindowDate(daysAhead);
      await createSchedule(owner, resolvedStaffId, dayOfWeekOf(date));
      const availRes = await request(server())
        .post("/api/v1/salons/elegance/availability")
        .send({ serviceIds: [serviceId], date, staffId: resolvedStaffId })
        .expect(200);
      const slots = availRes.body.slots as Array<{ start: string }>;
      if (slots.length > 0) {
        return { staffId: resolvedStaffId, serviceId, date, slotStart: slots[0].start };
      }
    }
    throw new Error(`No available slot found for staff ${resolvedStaffId} within 9 days`);
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

  /**
   * P17 gap closure (DEVELOPMENT_PLAN.md §2.4 "add service during appointment
   * / remove service") — `docs/API.md` lines 85-86 document the contract;
   * DECISIONS.md §19 records why this was built now rather than deferred.
   */
  describe("add/remove service (P17)", () => {
    /**
     * Scans forward for a free day rather than assuming `inWindowDate(2)` has
     * room — `myStaffId` below is the shared demo "staff@demo.salon"-linked
     * row also used by the S6 test above, and across many repeated e2e runs
     * against the persistent dev DB its fixed schedule window can fill up.
     */
    async function findAvailableSlotForStaff(
      owner: string,
      staffId: string,
      serviceId: string,
    ): Promise<{ date: string; start: string }> {
      for (let daysAhead = 2; daysAhead <= 9; daysAhead++) {
        const date = inWindowDate(daysAhead);
        await createSchedule(owner, staffId, dayOfWeekOf(date));
        const availRes = await request(server())
          .post("/api/v1/salons/elegance/availability")
          .send({ serviceIds: [serviceId], date, staffId })
          .expect(200);
        const slots = availRes.body.slots as Array<{ start: string }>;
        if (slots.length > 0) {
          return { date, start: slots[0].start };
        }
      }
      throw new Error(`No available slot found for staff ${staffId} within 9 days`);
    }

    async function twoServiceFixture(
      owner: string,
      namePrefix: string,
    ): Promise<{ staffId: string; serviceAId: string; serviceBId: string; date: string; slotStart: string }> {
      const staffId = await createStaff(owner, `${namePrefix} Staff`);
      const serviceAId = await createService(owner, `${namePrefix} Service A`, 30, 500000);
      const serviceBId = await createService(owner, `${namePrefix} Service B`, 15, 300000);
      await assignServices(owner, staffId, [serviceAId, serviceBId]);
      const date = inWindowDate(2);
      await createSchedule(owner, staffId, dayOfWeekOf(date));
      const availRes = await request(server())
        .post("/api/v1/salons/elegance/availability")
        .send({ serviceIds: [serviceAId], date, staffId })
        .expect(200);
      return { staffId, serviceAId, serviceBId, date, slotStart: availRes.body.slots[0].start as string };
    }

    async function createWalkIn(owner: string, staffId: string, serviceId: string, start: string) {
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "AddRemove", lastName: "Test", phone: uniquePhone() },
          serviceIds: [serviceId],
          staffId,
          start,
          source: "WALK_IN",
        })
        .expect(201);
      return res.body;
    }

    async function recordFullPayment(owner: string, appointmentId: string, amountCents: number) {
      await request(server())
        .post(`/api/v1/appointments/${appointmentId}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents, method: "CASH", type: "FULL" })
        .expect(201);
    }

    it("adds a service, recomputes totals, and writes an audit entry", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await twoServiceFixture(owner, "Add Recompute");
      const appointment = await createWalkIn(owner, fixture.staffId, fixture.serviceAId, fixture.slotStart);
      assert.equal(appointment.totalCents, 500000);

      const res = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [fixture.serviceBId] })
        .expect(201);

      assert.equal(res.body.totalCents, 800000);
      assert.equal(res.body.balanceCents, 800000);

      const auditRes = await request(server())
        .get(`/api/v1/audit?entityType=Appointment&entityId=${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.ok(
        (auditRes.body.data as Array<{ action: string }>).some((a) => a.action === "APPOINTMENT_SERVICE_ADDED"),
      );
    });

    it("rejects adding a service to a cancelled appointment", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await twoServiceFixture(owner, "Add Cancelled");
      const appointment = await createWalkIn(owner, fixture.staffId, fixture.serviceAId, fixture.slotStart);
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "test" })
        .expect(200);

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [fixture.serviceBId] })
        .expect(409);
    });

    it("removes a service without a refund when nothing was overpaid", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await twoServiceFixture(owner, "Remove NoRefund");
      const appointment = await createWalkIn(owner, fixture.staffId, fixture.serviceAId, fixture.slotStart);
      const added = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [fixture.serviceBId] })
        .expect(201);
      const lineToRemove = (added.body.lines ?? []).find(
        (l: { serviceId: string }) => l.serviceId === fixture.serviceBId,
      ) as { id: string } | undefined;
      assert.ok(lineToRemove, "expected the newly-added line in the response");

      const res = await request(server())
        .delete(`/api/v1/appointments/${appointment.id}/services/${lineToRemove!.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "customer changed their mind" })
        .expect(200);

      assert.equal(res.body.totalCents, 500000);
      assert.equal(res.body.balanceCents, 500000);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(paymentsRes.body.data.length, 0);
    });

    it("refunds the overpayment when removing a service drops the total below what's already paid", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await twoServiceFixture(owner, "Remove Refund");
      const appointment = await createWalkIn(owner, fixture.staffId, fixture.serviceAId, fixture.slotStart);
      const added = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/services`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ serviceIds: [fixture.serviceBId] })
        .expect(201);
      await recordFullPayment(owner, appointment.id, 800000);

      const lineToRemove = (added.body.lines ?? []).find(
        (l: { serviceId: string }) => l.serviceId === fixture.serviceBId,
      ) as { id: string } | undefined;
      assert.ok(lineToRemove, "expected the newly-added line in the response");

      const res = await request(server())
        .delete(`/api/v1/appointments/${appointment.id}/services/${lineToRemove!.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "customer changed their mind" })
        .expect(200);

      assert.equal(res.body.totalCents, 500000);
      assert.equal(res.body.advancePaidCents, 500000);
      assert.equal(res.body.balanceCents, 0);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(paymentsRes.body.data[0].state, "PARTIALLY_REFUNDED");
    });

    it("rejects removing the last active service line", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await twoServiceFixture(owner, "Remove LastLine");
      const appointment = await createWalkIn(owner, fixture.staffId, fixture.serviceAId, fixture.slotStart);
      const detail = await request(server())
        .get(`/api/v1/appointments/${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      const onlyLine = detail.body.lines[0] as { id: string };

      await request(server())
        .delete(`/api/v1/appointments/${appointment.id}/services/${onlyLine.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "test" })
        .expect(400);
    });

    it("RBAC: STAFF may add a service to their own appointment but not remove one; RECEPTIONIST may do both", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const staffLogin = await login("staff@demo.salon", "demo1234");
      const receptionist = (await login("receptionist@demo.salon", "demo1234")).token;
      const myStaffId = await resolveOrLinkStaffId(owner, staffLogin.userId, "P17 Services My Staff");
      // Services created + assigned directly to myStaffId from the start (not a separate
      // fixture staff re-assigned afterward) — mirrors the working S6 test's pattern exactly.
      const serviceAId = await createService(owner, "P17 Services RBAC Service A", 30, 500000);
      const serviceBId = await createService(owner, "P17 Services RBAC Service B", 15, 300000);
      await assignServices(owner, myStaffId, [serviceAId, serviceBId]);
      const slot = await findAvailableSlotForStaff(owner, myStaffId, serviceAId);
      const appointment = await createWalkIn(owner, myStaffId, serviceAId, slot.start);

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/services`)
        .set("Authorization", `Bearer ${staffLogin.token}`)
        .send({ serviceIds: [serviceBId] })
        .expect(201);

      const detail = await request(server())
        .get(`/api/v1/appointments/${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      const newLine = (detail.body.lines as Array<{ id: string; serviceId: string }>).find(
        (l) => l.serviceId === serviceBId,
      )!;

      await request(server())
        .delete(`/api/v1/appointments/${appointment.id}/services/${newLine.id}`)
        .set("Authorization", `Bearer ${staffLogin.token}`)
        .send({ reason: "staff cannot do this" })
        .expect(403);

      await request(server())
        .delete(`/api/v1/appointments/${appointment.id}/services/${newLine.id}`)
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ reason: "receptionist can" })
        .expect(200);
    });

    it("cross-tenant: 404s adding/removing a service on another tenant's appointment", async () => {
      const superToken = (await login("super.admin@salon.local", "super-admin-demo-password-2026")).token;
      const unique = Date.now();
      const ownerEmail = `owner-${unique}@appt-services-e2e.test`;
      await request(server())
        .post("/api/v1/super-admin/tenants")
        .set("Authorization", `Bearer ${superToken}`)
        .send({
          salonName: "Appt Services E2E Salon",
          slug: `appt-services-e2e-${unique}`,
          ownerName: "Tenant B Owner",
          ownerEmail,
          ownerPassword: "password123",
        })
        .expect(201);

      const tenantAOwner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await twoServiceFixture(tenantAOwner, "Appt Services Cross Tenant");
      const appointment = await createWalkIn(tenantAOwner, fixture.staffId, fixture.serviceAId, fixture.slotStart);
      const detail = await request(server())
        .get(`/api/v1/appointments/${appointment.id}`)
        .set("Authorization", `Bearer ${tenantAOwner}`)
        .expect(200);
      const onlyLine = detail.body.lines[0] as { id: string };

      const tenantBOwner = (await login(ownerEmail, "password123")).token;
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/services`)
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ serviceIds: [fixture.serviceBId] })
        .expect(404);
      await request(server())
        .delete(`/api/v1/appointments/${appointment.id}/services/${onlyLine.id}`)
        .set("Authorization", `Bearer ${tenantBOwner}`)
        .send({ reason: "not mine" })
        .expect(404);
    });
  });
});
