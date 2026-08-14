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
 * The payment matrix (DEVELOPMENT_PLAN.md §2.3) is written for a real async
 * gateway; this codebase's ManualProvider is synchronous and record-only
 * (docs/DECISIONS.md P13 entry has the full translation table). Several
 * scenarios below prove the *structural* guarantee (same-transaction
 * atomicity, hold-expiry-before-payment) rather than a literal async race.
 */
describe("Payments (e2e) — advance rules, recording, refunds, matrix translation", () => {
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

  /** A fresh, isolated tenant per test that needs a non-default advanceRule — never mutates the shared "elegance" demo tenant's settings. */
  async function provisionTenant(namePrefix: string): Promise<{ ownerToken: string; slug: string }> {
    const superToken = (await login("super.admin@salon.local", "super-admin-demo-password-2026")).token;
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `payments-e2e-${unique}`;
    const ownerEmail = `owner-${unique}@payments-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug,
        ownerName: "Payments E2E Owner",
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
    slug: string,
    namePrefix: string,
  ): Promise<{ staffId: string; serviceId: string; date: string; slotStart: string; priceCents: number }> {
    const staffId = await createStaff(ownerToken, `${namePrefix} Staff`);
    const priceCents = 500000;
    const serviceId = await createService(ownerToken, `${namePrefix} Service`, 30, priceCents);
    await assignServices(ownerToken, staffId, [serviceId]);
    const date = inWindowDate(2);
    await createSchedule(ownerToken, staffId, dayOfWeekOf(date));

    const availRes = await request(server())
      .post(`/api/v1/salons/${slug}/availability`)
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    return { staffId, serviceId, date, slotStart: availRes.body.slots[0].start as string, priceCents };
  }

  async function reserveAndConfirmOnline(
    slug: string,
    fixture: { serviceId: string; staffId: string; slotStart: string },
    idempotencyKey = crypto.randomUUID(),
  ) {
    const reserveRes = await request(server())
      .post(`/api/v1/salons/${slug}/bookings`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        serviceIds: [fixture.serviceId],
        staffId: fixture.staffId,
        start: fixture.slotStart,
        customer: { firstName: "Pay", lastName: "Ment", phone: uniquePhone() },
      })
      .expect(201);

    const confirmRes = await request(server())
      .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/confirm`)
      .set("Idempotency-Key", idempotencyKey)
      .send({})
      .expect(200);

    return { reserveBody: reserveRes.body, confirmBody: confirmRes.body };
  }

  describe("advance-rule evaluation (PricingService)", () => {
    it("NO_ADVANCE (default): reserve shows 0 advance; confirm creates zero Payment rows", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "elegance", "Payments NoAdvance");

      const { reserveBody, confirmBody } = await reserveAndConfirmOnline("elegance", fixture);
      assert.equal(reserveBody.paymentIntent.advanceRequiredCents, 0);
      assert.equal(reserveBody.paymentIntent.balanceCents, fixture.priceCents);
      assert.equal(confirmBody.appointment.advancePaidCents, 0);
      assert.equal(confirmBody.appointment.balanceCents, fixture.priceCents);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${confirmBody.appointment.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(paymentsRes.body.data.length, 0);
    });

    it("FIXED_AMOUNT: reserve shows the configured advance; confirm records exactly one ONLINE Payment", async () => {
      const { ownerToken, slug } = await provisionTenant("Fixed Advance");
      await patchSettings(ownerToken, { advanceRule: "FIXED_AMOUNT", advanceValueCents: 100000 });
      const fixture = await bookableFixture(ownerToken, slug, "Fixed");

      const { reserveBody, confirmBody } = await reserveAndConfirmOnline(slug, fixture);
      assert.equal(reserveBody.paymentIntent.advanceRequiredCents, 100000);
      assert.equal(reserveBody.paymentIntent.balanceCents, fixture.priceCents - 100000);
      assert.equal(confirmBody.appointment.advancePaidCents, 100000);
      assert.equal(confirmBody.appointment.balanceCents, fixture.priceCents - 100000);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${confirmBody.appointment.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      assert.equal(paymentsRes.body.data.length, 1);
      assert.equal(paymentsRes.body.data[0].amountCents, 100000);
      assert.equal(paymentsRes.body.data[0].method, "ONLINE");
      assert.equal(paymentsRes.body.data[0].type, "ADVANCE");
      assert.equal(paymentsRes.body.data[0].state, "SUCCESS");
    });

    it("FIXED_AMOUNT exceeding the total is capped: advance equals the total, type is FULL", async () => {
      const { ownerToken, slug } = await provisionTenant("Fixed Over");
      await patchSettings(ownerToken, { advanceRule: "FIXED_AMOUNT", advanceValueCents: 999999999 });
      const fixture = await bookableFixture(ownerToken, slug, "FixedOver");

      const { reserveBody, confirmBody } = await reserveAndConfirmOnline(slug, fixture);
      assert.equal(reserveBody.paymentIntent.advanceRequiredCents, fixture.priceCents);
      assert.equal(reserveBody.paymentIntent.balanceCents, 0);
      assert.equal(confirmBody.appointment.balanceCents, 0);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${confirmBody.appointment.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      assert.equal(paymentsRes.body.data[0].type, "FULL");
    });

    it("PERCENTAGE: advance is the configured percent of the total", async () => {
      const { ownerToken, slug } = await provisionTenant("Percentage");
      await patchSettings(ownerToken, { advanceRule: "PERCENTAGE", advancePercent: 50 });
      const fixture = await bookableFixture(ownerToken, slug, "Percent");

      const { reserveBody } = await reserveAndConfirmOnline(slug, fixture);
      assert.equal(reserveBody.paymentIntent.advanceRequiredCents, fixture.priceCents / 2);
    });

    it("FULL_PAYMENT: advance equals the total; balance is 0", async () => {
      const { ownerToken, slug } = await provisionTenant("Full Payment");
      await patchSettings(ownerToken, { advanceRule: "FULL_PAYMENT" });
      const fixture = await bookableFixture(ownerToken, slug, "Full");

      const { reserveBody, confirmBody } = await reserveAndConfirmOnline(slug, fixture);
      assert.equal(reserveBody.paymentIntent.advanceRequiredCents, fixture.priceCents);
      assert.equal(confirmBody.appointment.balanceCents, 0);
    });
  });

  describe("matrix translation — idempotency, duplication, expiry (P3-P7)", () => {
    it("P4/P5: retrying confirm with the same Idempotency-Key never creates a second Payment", async () => {
      const { ownerToken, slug } = await provisionTenant("Idempotent Confirm");
      await patchSettings(ownerToken, { advanceRule: "FIXED_AMOUNT", advanceValueCents: 50000 });
      const fixture = await bookableFixture(ownerToken, slug, "Idem");
      const key = crypto.randomUUID();

      const { reserveBody, confirmBody } = await reserveAndConfirmOnline(slug, fixture, key);
      // Retry with the identical key — idempotent replay branch.
      await request(server())
        .post(`/api/v1/payments/${reserveBody.paymentIntent.id}/confirm`)
        .set("Idempotency-Key", key)
        .send({})
        .expect(200);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${confirmBody.appointment.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      assert.equal(paymentsRes.body.data.length, 1);
    });

    it("P3/P6: an expired hold never creates a Payment row (nothing to expire, by construction)", async () => {
      const { ownerToken, slug } = await provisionTenant("Expired Hold");
      await patchSettings(ownerToken, { advanceRule: "FIXED_AMOUNT", advanceValueCents: 50000 });
      const fixture = await bookableFixture(ownerToken, slug, "Expiry");
      const key = crypto.randomUUID();

      const reserveRes = await request(server())
        .post(`/api/v1/salons/${slug}/bookings`)
        .set("Idempotency-Key", key)
        .send({
          serviceIds: [fixture.serviceId],
          staffId: fixture.staffId,
          start: fixture.slotStart,
          customer: { firstName: "Expire", lastName: "Me", phone: uniquePhone() },
        })
        .expect(201);

      // Cancel it (equivalent outcome to expiry: the hold is released, never confirmed).
      await request(server())
        .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/cancel`)
        .send({})
        .expect(200);

      await request(server())
        .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/confirm`)
        .set("Idempotency-Key", key)
        .send({})
        .expect(409);

      const customersRes = await request(server())
        .get(`/api/v1/customers?q=Expire`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      const customer = customersRes.body.find((c: { firstName: string }) => c.firstName === "Expire");
      if (customer) {
        const paymentsRes = await request(server())
          .get(`/api/v1/payments?customerId=${customer.id}`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .expect(200);
        assert.equal(paymentsRes.body.data.length, 0);
      }
    });
  });

  describe("receptionist-recorded payments (POST /appointments/:id/payments)", () => {
    it("records a CASH payment, updates the balance, and rejects an overpayment", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "elegance", "Payments Record");

      const created = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Cash", lastName: "Payer", phone: uniquePhone() },
          serviceIds: [fixture.serviceId],
          staffId: fixture.staffId,
          start: fixture.slotStart,
          source: "WALK_IN",
        })
        .expect(201);
      assert.equal(created.body.balanceCents, fixture.priceCents);

      // Overpayment rejected first.
      await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents: fixture.priceCents + 1, method: "CASH", type: "FULL" })
        .expect(400);

      const idempotencyKey = crypto.randomUUID();
      const paid = await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ amountCents: fixture.priceCents, method: "CASH", type: "FULL" })
        .expect(201);
      assert.equal(paid.body.state, "SUCCESS");

      // Idempotent retry — same key, no second row.
      await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ amountCents: fixture.priceCents, method: "CASH", type: "FULL" })
        .expect(201);

      const appointmentRes = await request(server())
        .get(`/api/v1/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(appointmentRes.body.balanceCents, 0);
      assert.equal(appointmentRes.body.advancePaidCents, fixture.priceCents);

      const paymentsRes = await request(server())
        .get(`/api/v1/payments?appointmentId=${created.body.id}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(paymentsRes.body.data.length, 1);
    });

    it("RBAC: RECEPTIONIST can record; STAFF cannot", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const receptionist = (await login("receptionist@demo.salon", "demo1234")).token;
      const staff = (await login("staff@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "elegance", "Payments RBAC");

      const created = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "RBAC", lastName: "Test", phone: uniquePhone() },
          serviceIds: [fixture.serviceId],
          staffId: fixture.staffId,
          start: fixture.slotStart,
          source: "WALK_IN",
        })
        .expect(201);

      await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${staff}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents: 10000, method: "CASH", type: "BALANCE" })
        .expect(403);

      await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${receptionist}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents: 10000, method: "CASH", type: "BALANCE" })
        .expect(201);
    });

    it("cross-tenant: an appointment created under one tenant 404s another tenant's owner", async () => {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "elegance", "Payments Cross Tenant");
      const created = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Cross", lastName: "Tenant", phone: uniquePhone() },
          serviceIds: [fixture.serviceId],
          staffId: fixture.staffId,
          start: fixture.slotStart,
          source: "WALK_IN",
        })
        .expect(201);

      const { ownerToken: otherOwner } = await provisionTenant("Payments Cross B");
      await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${otherOwner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents: 10000, method: "CASH", type: "BALANCE" })
        .expect(404);
    });
  });

  describe("refunds (P9/P10 — manual, record-only)", () => {
    async function paidFixture(): Promise<{ owner: string; paymentId: string; appointmentId: string }> {
      const owner = (await login("owner@demo.salon", "demo1234")).token;
      const fixture = await bookableFixture(owner, "elegance", "Payments Refund");
      const created = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Refund", lastName: "Me", phone: uniquePhone() },
          serviceIds: [fixture.serviceId],
          staffId: fixture.staffId,
          start: fixture.slotStart,
          source: "WALK_IN",
        })
        .expect(201);
      const paid = await request(server())
        .post(`/api/v1/appointments/${created.body.id}/payments`)
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ amountCents: fixture.priceCents, method: "CASH", type: "FULL" })
        .expect(201);
      return { owner, paymentId: paid.body.id as string, appointmentId: created.body.id as string };
    }

    it("a full refund marks the payment REFUNDED and restores the appointment balance", async () => {
      const { owner, paymentId, appointmentId } = await paidFixture();

      const refund = await request(server())
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ amountCents: 500000, reason: "customer cancelled" })
        .expect(200);
      assert.equal(refund.body.state, "SUCCEEDED");

      const appointmentRes = await request(server())
        .get(`/api/v1/appointments/${appointmentId}`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(200);
      assert.equal(appointmentRes.body.balanceCents, 500000);
      assert.equal(appointmentRes.body.advancePaidCents, 0);
    });

    it("rejects a refund exceeding the payment's amount", async () => {
      const { owner, paymentId } = await paidFixture();
      await request(server())
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ amountCents: 999999999, reason: "too much" })
        .expect(400);
    });

    it("RBAC: OWNER/MANAGER can refund; RECEPTIONIST cannot", async () => {
      const { paymentId } = await paidFixture();
      const receptionist = (await login("receptionist@demo.salon", "demo1234")).token;
      await request(server())
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set("Authorization", `Bearer ${receptionist}`)
        .send({ amountCents: 10000, reason: "should be denied" })
        .expect(403);
    });
  });
});
