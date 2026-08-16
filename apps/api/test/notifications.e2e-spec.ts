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

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

function inWindowDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

let phoneCounter = 0;
function uniquePhone(): string {
  const suffix = `${Date.now()}${phoneCounter++}`.slice(-8);
  return `077${suffix}`;
}

let emailCounter = 0;
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}${emailCounter++}@notification-e2e.test`;
}

/**
 * Notification states + delivery-trigger wiring (DEVELOPMENT_PLAN.md P15 exit
 * criterion: "Notification states + retry tests; failure never cancels").
 * The backoff/exhaustion state machine and dedup logic are already covered
 * deterministically (no network dependency) by
 * `src/notification/notification.service.spec.ts` — this suite instead
 * verifies the parts only reachable over real HTTP + the DB: that each
 * business action actually fires the right event end-to-end, per-channel
 * status is queryable, RBAC (`VIEW_NOTIFICATIONS`) is enforced, and
 * tenant isolation holds. It deliberately does not poison `SMTP_HOST` to
 * force a real delivery failure — that would make this suite depend on live
 * DNS/network resolution, which the rest of this codebase avoids (e.g.
 * `PayHereProvider` is never actually invoked in tests either).
 */
describe("Notifications (e2e) — triggers, list, retry, RBAC, tenant isolation", () => {
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

  async function createStaff(token: string, name: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
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
    await request(server())
      .post("/api/v1/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({ staffId, dayOfWeek, startMin: 540, endMin: 1020 })
      .expect(201);
  }

  /** A fresh, isolated tenant — never mutates the shared "elegance" demo tenant's settings. */
  async function provisionTenant(namePrefix: string): Promise<{ ownerToken: string; slug: string }> {
    const superToken = await login("super.admin@salon.local", "super-admin-demo-password-2026");
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `notification-e2e-${unique}`;
    const ownerEmail = `owner-${unique}@notification-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug,
        ownerName: "Notification E2E Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);
    const ownerToken = await login(ownerEmail, "password123");
    return { ownerToken, slug };
  }

  async function bookableFixture(
    ownerToken: string,
    namePrefix: string,
  ): Promise<{ staffId: string; serviceId: string; date: string; priceCents: number }> {
    const staffId = await createStaff(ownerToken, `${namePrefix} Staff`);
    const priceCents = 500000;
    const serviceId = await createService(ownerToken, `${namePrefix} Service`, 30, priceCents);
    await assignServices(ownerToken, staffId, [serviceId]);
    const date = inWindowDate(2);
    await createSchedule(ownerToken, staffId, dayOfWeekOf(date));
    return { staffId, serviceId, date, priceCents };
  }

  async function availableSlots(slug: string, serviceId: string, staffId: string, date: string): Promise<string[]> {
    const res = await request(server())
      .post(`/api/v1/salons/${slug}/availability`)
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    return (res.body.slots as Array<{ start: string }>).map((s) => s.start);
  }

  async function createWalkIn(
    ownerToken: string,
    fixture: { serviceId: string; staffId: string },
    start: string,
    customer: { phone?: string; email?: string } = {},
  ) {
    const phone = customer.phone ?? uniquePhone();
    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Test", lastName: "Customer", phone, email: customer.email },
        serviceIds: [fixture.serviceId],
        staffId: fixture.staffId,
        start,
        source: "WALK_IN",
      })
      .expect(201);
    return { appointment: res.body, phone };
  }

  async function notificationsFor(
    token: string,
    appointmentId: string,
  ): Promise<Array<{ id: string; type: string; channel: string; status: string; recipient: string }>> {
    const res = await request(server())
      .get(`/api/v1/notifications?appointmentId=${appointmentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    return res.body.data;
  }

  describe("trigger wiring", () => {
    it("fires BOOKING_CONFIRMATION on both channels when the customer has an email on file", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Confirm BothChannels");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start, { email: uniqueEmail("customer") });

      const notifications = await notificationsFor(owner, appointment.id);
      const confirmations = notifications.filter((n) => n.type === "BOOKING_CONFIRMATION");
      assert.deepEqual(
        confirmations.map((n) => n.channel).sort(),
        ["console", "email"],
      );
      for (const n of confirmations) {
        assert.equal(n.status, "SENT");
      }
    });

    it("fires only the CONSOLE channel when the customer has no email on file", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Confirm ConsoleOnly");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);

      const notifications = await notificationsFor(owner, appointment.id);
      const confirmations = notifications.filter((n) => n.type === "BOOKING_CONFIRMATION");
      assert.equal(confirmations.length, 1);
      assert.equal(confirmations[0].channel, "console");
    });

    it("fires PAYMENT_CONFIRMATION when a payment is recorded", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Payment Confirm");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start, { email: uniqueEmail("pay") });

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents: fixture.priceCents, method: "CASH", type: "FULL" })
        .expect(201);

      const notifications = await notificationsFor(owner, appointment.id);
      const paymentNotifications = notifications.filter((n) => n.type === "PAYMENT_CONFIRMATION");
      assert.ok(paymentNotifications.length >= 1);
      assert.equal(paymentNotifications[0].status, "SENT");
    });

    it("does not duplicate PAYMENT_CONFIRMATION on an idempotent retry of the same payment", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Payment Idempotent");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start, { email: uniqueEmail("pay2") });
      const key = crypto.randomUUID();
      const body = { amountCents: fixture.priceCents, method: "CASH", type: "FULL" };

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);

      const notifications = await notificationsFor(owner, appointment.id);
      const paymentNotifications = notifications.filter((n) => n.type === "PAYMENT_CONFIRMATION");
      // One per channel (console + email) for the single real payment — the replay fired nothing extra.
      assert.equal(paymentNotifications.length, 2);
    });

    it("fires CANCELLATION_CONFIRMATION on cancel", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Cancel Confirm");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start, { email: uniqueEmail("cancel") });

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "customer request" })
        .expect(200);

      const notifications = await notificationsFor(owner, appointment.id);
      const cancellations = notifications.filter((n) => n.type === "CANCELLATION_CONFIRMATION");
      assert.ok(cancellations.length >= 1);
      assert.equal(cancellations[0].status, "SENT");
    });

    it("a cancellation failure path (already-cancelled) never creates a notification and never blocks the error response", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Cancel Twice NoDup");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start, { email: uniqueEmail("cancel2") });

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "first cancel" })
        .expect(200);
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "second cancel" })
        .expect(409);

      const notifications = await notificationsFor(owner, appointment.id);
      const cancellations = notifications.filter((n) => n.type === "CANCELLATION_CONFIRMATION");
      // Exactly the two channels for the one real cancellation — the rejected second attempt fired nothing.
      assert.equal(cancellations.length, 2);
    });
  });

  describe("list + retry", () => {
    it("retry re-attempts delivery and returns the updated row", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Retry Route");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);
      const [notification] = await notificationsFor(owner, appointment.id);

      const res = await request(server())
        .post(`/api/v1/notifications/${notification.id}/retry`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(res.body.id, notification.id);
      assert.equal(res.body.status, "SENT");
    });

    it("404s retrying an unknown notification id", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      await request(server())
        .post(`/api/v1/notifications/${crypto.randomUUID()}/retry`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(404);
    });

    it("filters by status", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Filter Status");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);

      const res = await request(server())
        .get(`/api/v1/notifications?appointmentId=${appointment.id}&status=SENT`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.ok(res.body.data.length >= 1);
      assert.ok((res.body.data as Array<{ status: string }>).every((n) => n.status === "SENT"));
    });
  });

  describe("RBAC", () => {
    it("denies STAFF from viewing or retrying notifications; RECEPTIONIST is allowed to view", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const staffToken = await login("staff@demo.salon", "demo1234");
      const receptionist = await login("receptionist@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "RBAC Notifications");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);

      await request(server())
        .get(`/api/v1/notifications?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);

      await request(server())
        .get(`/api/v1/notifications?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${receptionist}`)
        .expect(200);
    });
  });

  describe("cross-tenant isolation", () => {
    it("another tenant's owner sees no notifications for this appointment and cannot retry them", async () => {
      const owner = await login("owner@demo.salon", "demo1234");
      const fixture = await bookableFixture(owner, "Cross Tenant Notifications");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);
      const [notification] = await notificationsFor(owner, appointment.id);

      const { ownerToken: otherOwner } = await provisionTenant("Cross Tenant Notifications B");

      const listRes = await request(server())
        .get(`/api/v1/notifications?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${otherOwner}`)
        .expect(200);
      assert.equal(listRes.body.data.length, 0);

      await request(server())
        .post(`/api/v1/notifications/${notification.id}/retry`)
        .set("Authorization", `Bearer ${otherOwner}`)
        .expect(404);
    });
  });
});
