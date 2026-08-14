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

describe("Booking (e2e) — online flow", () => {
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
    await request(server())
      .post("/api/v1/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({ staffId, dayOfWeek, startMin: 540, endMin: 1020 })
      .expect(201);
  }

  async function bookableFixture(
    owner: string,
    namePrefix: string,
  ): Promise<{ staffId: string; serviceId: string; date: string; slotStart: string }> {
    const staffId = await createStaff(owner, `${namePrefix} Staff`);
    const serviceId = await createService(owner, `${namePrefix} Service`, 30);
    await assignServices(owner, staffId, [serviceId]);
    const date = inWindowDate(2);
    await createSchedule(owner, staffId, dayOfWeekOf(date));

    const availRes = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    return { staffId, serviceId, date, slotStart: availRes.body.slots[0].start as string };
  }

  it("rejects a booking without a valid Idempotency-Key header", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Booking Missing Key");

    const res = await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .send({
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        customer: { firstName: "Nadeesha", lastName: "Silva", phone: "0771111111" },
      })
      .expect(400);
    assert.equal(res.body.code, "VALIDATION_ERROR");
  });

  it("404s SALON_NOT_FOUND for a bogus slug", async () => {
    const res = await request(server())
      .post("/api/v1/salons/does-not-exist/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        serviceIds: ["11111111-1111-4111-8111-111111111111"],
        staffId: "11111111-1111-4111-8111-111111111111",
        start: new Date().toISOString(),
        customer: { firstName: "A", lastName: "B", phone: "0771111111" },
      })
      .expect(404);
    assert.equal(res.body.code, "SALON_NOT_FOUND");
  });

  it("books online end-to-end: reserve, confirm, and look up by reference", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Booking Happy Path");
    const key = crypto.randomUUID();
    const phone = "0779990001";

    const reserveRes = await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .set("Idempotency-Key", key)
      .send({
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        customer: { firstName: "Nadeesha", lastName: "Silva", phone },
      })
      .expect(201);

    assert.ok(reserveRes.body.bookingReference);
    assert.equal(reserveRes.body.paymentIntent.amountCents, 500000);
    assert.equal(reserveRes.body.paymentIntent.status, "PENDING");

    // Retrying the exact same request with the same key must be idempotent.
    const retryRes = await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .set("Idempotency-Key", key)
      .send({
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        customer: { firstName: "Nadeesha", lastName: "Silva", phone },
      })
      .expect(201);
    assert.equal(retryRes.body.bookingReference, reserveRes.body.bookingReference);
    assert.equal(retryRes.body.paymentIntent.id, reserveRes.body.paymentIntent.id);

    const confirmRes = await request(server())
      .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/confirm`)
      .set("Idempotency-Key", key)
      .send({})
      .expect(200);
    assert.equal(confirmRes.body.appointment.status, "CONFIRMED");
    assert.equal(confirmRes.body.bookingReference, reserveRes.body.bookingReference);
    assert.equal(confirmRes.body.appointment.staff.id, staffId);
    assert.equal(confirmRes.body.appointment.lines.length, 1);
    assert.equal(confirmRes.body.appointment.lines[0].serviceId, serviceId);

    // Confirming again with the same key is idempotent, not a duplicate appointment.
    const confirmAgain = await request(server())
      .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/confirm`)
      .set("Idempotency-Key", key)
      .send({})
      .expect(200);
    assert.equal(confirmAgain.body.appointment.id, confirmRes.body.appointment.id);

    const lookupRes = await request(server())
      .get(`/api/v1/bookings/${confirmRes.body.bookingReference}?phone=${phone}`)
      .expect(200);
    assert.equal(lookupRes.body.bookingReference, confirmRes.body.bookingReference);
    assert.equal(lookupRes.body.staff.id, staffId);
    assert.equal(lookupRes.body.lines.length, 1);
    assert.equal(lookupRes.body.lines[0].serviceId, serviceId);

    // Wrong phone must not reveal the booking.
    await request(server())
      .get(`/api/v1/bookings/${confirmRes.body.bookingReference}?phone=0770000000`)
      .expect(404);
  });

  it("cancels a hold: the slot becomes available again and confirming it afterwards fails", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart, date } = await bookableFixture(owner, "Booking Cancel Path");
    const key = crypto.randomUUID();

    const reserveRes = await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .set("Idempotency-Key", key)
      .send({
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        customer: { firstName: "Kasun", lastName: "Fernando", phone: "0772223333" },
      })
      .expect(201);

    await request(server())
      .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/cancel`)
      .expect(200);

    await request(server())
      .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/confirm`)
      .set("Idempotency-Key", key)
      .send({})
      .expect(409);

    const availAfterCancel = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    assert.ok(
      (availAfterCancel.body.slots as Array<{ start: string }>).some((s) => s.start === slotStart),
    );
  });

  it("404s HOLD_NOT_FOUND when confirming an unknown payment intent", async () => {
    const res = await request(server())
      .post(`/api/v1/payments/${crypto.randomUUID()}/confirm`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(404);
    assert.equal(res.body.code, "HOLD_NOT_FOUND");
  });
});
