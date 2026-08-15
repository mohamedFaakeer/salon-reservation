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

let phoneCounter = 0;
function uniquePhone(): string {
  const suffix = `${Date.now()}${phoneCounter++}`.slice(-8);
  return `077${suffix}`;
}

/**
 * §2.4 "Appointment lifecycle" (DEVELOPMENT_PLAN.md) — cancellation with/
 * without refund, reschedule success/failure, no-show grace gating, RBAC,
 * cross-tenant isolation. docs/DECISIONS.md's P14 entry explains why a
 * couple of matrix rows (e.g. "no-show after grace elapses") stay unit-only:
 * they'd require a genuinely past appointment, which the real booking flow
 * can't produce (same-day lead time always rejects a past/near-past start).
 */
describe("Cancellation / Rescheduling (e2e) — RefundCalculator, cancel, reschedule, no-show", () => {
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
    const superToken = (await login("super.admin@salon.local", "super-admin-demo-password-2026")).token;
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `cancellation-e2e-${unique}`;
    const ownerEmail = `owner-${unique}@cancellation-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug,
        ownerName: "Cancellation E2E Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);
    const ownerToken = (await login(ownerEmail, "password123")).token;
    return { ownerToken, slug };
  }

  async function patchSettings(token: string, patch: Record<string, unknown>): Promise<void> {
    await request(server())
      .patch("/api/v1/tenant/me/settings")
      .set("Authorization", `Bearer ${token}`)
      .send(patch)
      .expect(200);
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
    phone = uniquePhone(),
  ) {
    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Test", lastName: "Customer", phone },
        serviceIds: [fixture.serviceId],
        staffId: fixture.staffId,
        start,
        source: "WALK_IN",
      })
      .expect(201);
    return { appointment: res.body, phone };
  }

  async function recordFullPayment(ownerToken: string, appointmentId: string, amountCents: number) {
    await request(server())
      .post(`/api/v1/appointments/${appointmentId}/payments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ amountCents, method: "CASH", type: "FULL" })
      .expect(201);
  }

  describe("staff-initiated cancel — RefundCalculator tiers", () => {
    it("refunds in full when cancelled well before the (default 2h) cutoff", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "Cancel Refund");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);
      await recordFullPayment(owner, appointment.id, fixture.priceCents);

      const cancelled = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ reason: "customer request" })
        .expect(200);

      assert.equal(cancelled.body.status, "CANCELLED");
      assert.equal(cancelled.body.advancePaidCents, 0);
      assert.equal(cancelled.body.balanceCents, fixture.priceCents);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(paymentsRes.body.data[0].state, "REFUNDED");
    });

    it("refunds nothing when the effective cutoff is already in the past (0% tier)", async () => {
      const { ownerToken, slug } = await provisionTenant("Cancel NoRefund");
      // A cutoff this large is always "in the past" relative to now, for any
      // future booking — deterministically exercises the after-cutoff (0%)
      // tier without needing a genuinely near-future slot (blocked by
      // sameDayLeadMinutes on booking itself).
      await patchSettings(ownerToken, {
        cancellationPolicy: {
          selfServiceCutoffHours: 2160, // API-max (90 days) — always "past cutoff" for a 2-day-out booking
          refundPercentBeforeCutoff: 100,
          refundPercentAfterCutoff: 0,
          noShowRefundPercent: 0,
        },
      });
      const fixture = await bookableFixture(ownerToken, "Cancel NoRefund");
      const [start] = await availableSlots(slug, fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(ownerToken, fixture, start);
      await recordFullPayment(ownerToken, appointment.id, fixture.priceCents);

      const cancelled = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ reason: "late cancellation" })
        .expect(200);

      assert.equal(cancelled.body.status, "CANCELLED");
      assert.equal(cancelled.body.advancePaidCents, fixture.priceCents); // unchanged — no refund applied

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${appointment.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      assert.equal(paymentsRes.body.data[0].state, "SUCCESS"); // never touched
    });

    it("rejects cancelling an already-cancelled appointment", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "Cancel Twice");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);

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
    });
  });

  describe("self-service cancel — cutoff gating", () => {
    it("succeeds when well outside the (default 2h) cutoff", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "SelfCancel OK");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment, phone } = await createWalkIn(owner, fixture, start);

      const res = await request(server())
        .post(`/api/v1/bookings/${appointment.bookingReference}/cancel`)
        .send({ phone, reason: "changed my mind" })
        .expect(200);
      assert.equal(res.body.status, "CANCELLED");
    });

    it("is blocked inside the cutoff window ('call the salon')", async () => {
      const { ownerToken, slug } = await provisionTenant("SelfCancel Blocked");
      await patchSettings(ownerToken, {
        cancellationPolicy: {
          selfServiceCutoffHours: 2160, // API-max (90 days) — always "past cutoff" for a 2-day-out booking
          refundPercentBeforeCutoff: 100,
          refundPercentAfterCutoff: 0,
          noShowRefundPercent: 0,
        },
      });
      const fixture = await bookableFixture(ownerToken, "SelfCancel Blocked");
      const [start] = await availableSlots(slug, fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment, phone } = await createWalkIn(ownerToken, fixture, start);

      const res = await request(server())
        .post(`/api/v1/bookings/${appointment.bookingReference}/cancel`)
        .send({ phone, reason: "too late now" })
        .expect(409);
      assert.equal(res.body.code, "APPOINTMENT_NOT_CANCELLABLE");
    });

    it("staff cancel is never blocked by the self-service cutoff", async () => {
      const { ownerToken, slug } = await provisionTenant("StaffCancel Anytime");
      await patchSettings(ownerToken, {
        cancellationPolicy: {
          selfServiceCutoffHours: 2160, // API-max (90 days) — always "past cutoff" for a 2-day-out booking
          refundPercentBeforeCutoff: 100,
          refundPercentAfterCutoff: 0,
          noShowRefundPercent: 0,
        },
      });
      const fixture = await bookableFixture(ownerToken, "StaffCancel Anytime");
      const [start] = await availableSlots(slug, fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(ownerToken, fixture, start);

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ reason: "staff override" })
        .expect(200);
    });
  });

  describe("reschedule", () => {
    it("creates a new appointment, marks the original RESCHEDULED, and moves payments", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "Reschedule OK");
      const slots = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, slots[0]);
      await recordFullPayment(owner, appointment.id, fixture.priceCents);

      const res = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/reschedule`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ newStart: slots[1] })
        .expect(200);

      assert.equal(res.body.status, "CONFIRMED");
      assert.equal(res.body.rescheduledFromId, appointment.id);
      assert.equal(res.body.advancePaidCents, fixture.priceCents);
      assert.equal(res.body.balanceCents, 0);
      assert.notEqual(res.body.id, appointment.id);

      const original = await request(server())
        .get(`/api/v1/appointments/${appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(original.body.status, "RESCHEDULED");

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${res.body.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(paymentsRes.body.data.length, 1);
    });

    it("leaves the original untouched when the new slot is unavailable (concurrency matrix §2.2.4)", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "Reschedule Conflict");
      const firstSlots = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const occupiedStart = firstSlots[0];
      // Two genuinely separate (non-overlapping) appointments for the same
      // staff — re-fetching availability after the first booking, rather
      // than assuming array-adjacent slots don't overlap (they can, when the
      // service duration exceeds the engine's slot step granularity).
      await createWalkIn(owner, fixture, occupiedStart);
      const secondSlots = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment: toMove } = await createWalkIn(owner, fixture, secondSlots[0]);

      await request(server())
        .post(`/api/v1/appointments/${toMove.id}/reschedule`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ newStart: occupiedStart }) // already taken by the first booking
        .expect(409);

      const stillOriginal = await request(server())
        .get(`/api/v1/appointments/${toMove.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(stillOriginal.body.status, "CONFIRMED");
      assert.equal(new Date(stillOriginal.body.startTime).toISOString(), new Date(secondSlots[0]).toISOString());
    });

    it("self-service reschedule is blocked inside the cutoff window", async () => {
      const { ownerToken, slug } = await provisionTenant("SelfReschedule Blocked");
      await patchSettings(ownerToken, {
        cancellationPolicy: {
          selfServiceCutoffHours: 2160, // API-max (90 days) — always "past cutoff" for a 2-day-out booking
          refundPercentBeforeCutoff: 100,
          refundPercentAfterCutoff: 0,
          noShowRefundPercent: 0,
        },
      });
      const fixture = await bookableFixture(ownerToken, "SelfReschedule Blocked");
      const slots = await availableSlots(slug, fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment, phone } = await createWalkIn(ownerToken, fixture, slots[0]);

      const res = await request(server())
        .post(`/api/v1/bookings/${appointment.bookingReference}/reschedule`)
        .send({ phone, newStart: slots[1] })
        .expect(409);
      assert.equal(res.body.code, "APPOINTMENT_NOT_CANCELLABLE");
    });
  });

  describe("no-show", () => {
    it("rejects marking no-show before the grace period has elapsed (any future booking)", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "NoShow TooEarly");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);

      const res = await request(server())
        .post(`/api/v1/appointments/${appointment.id}/no-show`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(400);
      assert.equal(res.body.code, "BAD_STATE");
    });

    it("rejects marking no-show for a COMPLETED appointment", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "NoShow Completed");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/check-in`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/in-service`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/complete`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);

      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/no-show`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(400);
    });
  });

  describe("RBAC", () => {
    it("denies STAFF from cancelling or rescheduling; RECEPTIONIST is allowed", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const staffLogin = await login("staff@demo.salon", "demo1234");
      const receptionist = (await login("receptionist@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "RBAC Lifecycle");
      const firstSlots = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment: forCancel } = await createWalkIn(owner, fixture, firstSlots[0]);
      // Re-fetch after the first booking — array-adjacent slots can overlap
      // once a booking's duration exceeds the engine's slot step.
      const secondSlots = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment: forReschedule } = await createWalkIn(owner, fixture, secondSlots[0]);

      await request(server())
        .post(`/api/v1/appointments/${forCancel.id}/cancel`)
        .set("Authorization", `Bearer ${staffLogin.token}`)
        .send({ reason: "denied" })
        .expect(403);

      await request(server())
        .post(`/api/v1/appointments/${forCancel.id}/cancel`)
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ reason: "allowed" })
        .expect(200);

      await request(server())
        .post(`/api/v1/appointments/${forReschedule.id}/reschedule`)
        .set("Authorization", `Bearer ${staffLogin.token}`)
        .send({ newStart: secondSlots[1] })
        .expect(403);
    });
  });

  describe("cross-tenant isolation", () => {
    it("an appointment created under one tenant 404s for another tenant's owner on cancel", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "Cross Tenant Cancel");
      const [start] = await availableSlots("elegance", fixture.serviceId, fixture.staffId, fixture.date);
      const { appointment } = await createWalkIn(owner, fixture, start);

      const { ownerToken: otherOwner } = await provisionTenant("Cross Tenant Cancel B");
      await request(server())
        .post(`/api/v1/appointments/${appointment.id}/cancel`)
        .set("Authorization", `Bearer ${otherOwner}`)
        .send({ reason: "not mine" })
        .expect(404);
    });
  });
});
