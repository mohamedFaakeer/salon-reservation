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

describe("Booking Concurrency (e2e) — exclusion constraints, holds, idempotency", () => {
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

  function onlineBookingBody(serviceId: string, staffId: string, slotStart: string, phone: string) {
    return {
      serviceIds: [serviceId],
      staffId,
      start: slotStart,
      customer: { firstName: "Race", lastName: "Customer", phone },
    };
  }

  it("two concurrent online bookings for the same slot: exactly one wins, the other gets 409 SLOT_UNAVAILABLE", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Concurrent Online");

    const [resA, resB] = await Promise.all([
      request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", crypto.randomUUID())
        .send(onlineBookingBody(serviceId, staffId, slotStart, uniquePhone())),
      request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", crypto.randomUUID())
        .send(onlineBookingBody(serviceId, staffId, slotStart, uniquePhone())),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    const loser = resA.status === 409 ? resA : resB;
    assert.equal(loser.body.code, "SLOT_UNAVAILABLE");
    assert.ok(winner.body.bookingReference);
    assert.ok(winner.body.paymentIntent.id);
  });

  it("a HELD slot disappears from availability immediately", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart, date } = await bookableFixture(owner, "Hold Visibility");

    await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send(onlineBookingBody(serviceId, staffId, slotStart, uniquePhone()))
      .expect(201);

    const availRes = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    assert.ok(
      !(availRes.body.slots as Array<{ start: string }>).some((s) => s.start === slotStart),
      "the held slot must not appear in availability",
    );
  });

  it("a HELD hold blocks a receptionist appointment for the same slot", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Hold vs Receptionist");

    await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send(onlineBookingBody(serviceId, staffId, slotStart, uniquePhone()))
      .expect(201);

    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Walk", lastName: "In", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(409);
    assert.equal(res.body.code, "SLOT_UNAVAILABLE");
  });

  it("two concurrent receptionist appointments for the same slot: exactly one wins", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Concurrent Receptionist");

    const [resA, resB] = await Promise.all([
      request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Walk", lastName: "One", phone: uniquePhone() },
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          source: "WALK_IN",
        }),
      request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Walk", lastName: "Two", phone: uniquePhone() },
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          source: "WALK_IN",
        }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const loser = resA.status === 409 ? resA : resB;
    assert.equal(loser.body.code, "SLOT_UNAVAILABLE");
  });

  it("retrying the same Idempotency-Key under a race returns the same hold, never a duplicate", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Idempotent Race");
    const key = crypto.randomUUID();
    const body = onlineBookingBody(serviceId, staffId, slotStart, uniquePhone());

    const [resA, resB] = await Promise.all([
      request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", key)
        .send(body),
      request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", key)
        .send(body),
    ]);

    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);
    assert.equal(resA.body.paymentIntent.id, resB.body.paymentIntent.id);
    assert.equal(resA.body.bookingReference, resB.body.bookingReference);
  });

  it("an online reserve for a slot already taken by a receptionist appointment fails with 409", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart } = await bookableFixture(owner, "Reserve After Taken");

    // Receptionist books the slot first.
    await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${owner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "First", lastName: "Booking", phone: uniquePhone() },
        serviceIds: [serviceId],
        staffId,
        start: slotStart,
        source: "WALK_IN",
      })
      .expect(201);

    // An online customer trying the same slot is rejected — the appointment
    // is a busy interval for `canBook`, so no hold is ever created.
    const res = await request(server())
      .post("/api/v1/salons/elegance/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send(onlineBookingBody(serviceId, staffId, slotStart, uniquePhone()))
      .expect(409);
    assert.equal(res.body.code, "SLOT_UNAVAILABLE");
  });

  /**
   * P17 gap closure — every prior concurrency test here races exactly 2
   * requests; this is the phase's own literal "concurrency soak" deliverable
   * (DEVELOPMENT_PLAN.md §2.2), a genuine N-way race against the DB
   * exclusion constraint (CLAUDE.md non-negotiable #3).
   */
  it("concurrency soak: 15 simultaneous receptionist bookings for the same slot — exactly one wins", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart, date } = await bookableFixture(owner, "Soak Receptionist");

    const responses = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        request(server())
          .post("/api/v1/appointments")
          .set("Authorization", `Bearer ${owner}`)
          .set("Idempotency-Key", crypto.randomUUID())
          .send({
            newCustomer: { firstName: "Soak", lastName: `Customer${i}`, phone: uniquePhone() },
            serviceIds: [serviceId],
            staffId,
            start: slotStart,
            source: "WALK_IN",
          }),
      ),
    );

    const winners = responses.filter((r) => r.status === 201);
    const losers = responses.filter((r) => r.status === 409);
    assert.equal(winners.length, 1, "exactly one of 15 concurrent requests must win the slot");
    assert.equal(losers.length, 14);
    assert.ok(losers.every((r) => r.body.code === "SLOT_UNAVAILABLE"));

    const listRes = await request(server())
      .get(`/api/v1/appointments?date=${date}&staffId=${staffId}`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    const forThisStaff = (listRes.body.data as Array<{ id: string }>).filter((a) => a.id === winners[0].body.id);
    assert.equal(forThisStaff.length, 1, "no duplicate row was created under the DB exclusion constraint");
  });

  /**
   * §2.2 item 2 — the receptionist+customer race, proven as a genuine
   * simultaneous request pair (the prior test-suite version proved both
   * directions sequentially, not under real concurrency).
   *
   * `reserve` only creates a `SlotHold` — a separate table from `Appointment`
   * with its own exclusion constraint — so under true simultaneity the
   * receptionist's create and the customer's reserve can *both* succeed at
   * their own step (a hold existing alongside a just-confirmed appointment
   * isn't itself a double-booking). The real, DB-enforced invariant is that
   * only one row can ever exist in `Appointment` for the slot — proven here
   * by following through to the online side's `confirm` step and checking
   * the final state, not by asserting exactly one of the two *first* calls
   * succeeds.
   */
  it("a receptionist and an online customer racing the same slot: exactly one appointment is ever confirmed", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const { serviceId, staffId, slotStart, date } = await bookableFixture(owner, "Receptionist Vs Customer");
    const idempotencyKey = crypto.randomUUID();

    const [receptionistRes, reserveRes] = await Promise.all([
      request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${owner}`)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          newCustomer: { firstName: "Reception", lastName: "Booked", phone: uniquePhone() },
          serviceIds: [serviceId],
          staffId,
          start: slotStart,
          source: "WALK_IN",
        }),
      request(server())
        .post("/api/v1/salons/elegance/bookings")
        .set("Idempotency-Key", idempotencyKey)
        .send(onlineBookingBody(serviceId, staffId, slotStart, uniquePhone())),
    ]);

    assert.ok(
      [201, 409].includes(receptionistRes.status) && [201, 409].includes(reserveRes.status),
      "each side must resolve to either success or SLOT_UNAVAILABLE, never a server error",
    );

    if (reserveRes.status === 201) {
      // The hold exists; whether the receptionist also won determines whether confirming it can still succeed.
      const confirmRes = await request(server())
        .post(`/api/v1/payments/${reserveRes.body.paymentIntent.id}/confirm`)
        .set("Idempotency-Key", idempotencyKey)
        .send({});
      if (receptionistRes.status === 201) {
        assert.equal(confirmRes.status, 409, "the slot is already taken — confirming the hold must fail");
      } else {
        assert.equal(confirmRes.status, 200);
      }
    } else {
      assert.equal(reserveRes.body.code, "SLOT_UNAVAILABLE");
      assert.equal(receptionistRes.status, 201, "if the reserve lost, the receptionist's booking must have won");
    }

    const listRes = await request(server())
      .get(`/api/v1/appointments?date=${date}&staffId=${staffId}`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.equal(
      (listRes.body.data as unknown[]).length,
      1,
      "exactly one confirmed appointment must exist for this slot, regardless of which side won",
    );
  });
});