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
 * P16 dashboard stats (DEVELOPMENT_PLAN.md exit criterion: "Dashboard e2e;
 * calendar renders"). `NO_SHOW` counting isn't exercised here — constructing
 * a genuinely past appointment through the real booking API isn't possible
 * (the same lead-time guard P14's DECISIONS.md §16 pt.12 already documented
 * for the identical reason); it's covered by `DashboardService`'s own unit
 * tests using a directly-constructed row instead.
 */
describe("Dashboard (e2e) — GET /dashboard/today", () => {
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
      .send({ staffId, dayOfWeek, startMin: 0, endMin: 1439 })
      .expect(201);
  }

  /** A fresh, isolated tenant — never mutates the shared "elegance" demo tenant's settings/data. */
  async function provisionTenant(namePrefix: string): Promise<{ ownerToken: string; slug: string }> {
    const superToken = await login("super.admin@salon.local", "super-admin-demo-password-2026");
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `dashboard-e2e-${unique}`;
    const ownerEmail = `owner-${unique}@dashboard-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug,
        ownerName: "Dashboard E2E Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);
    const ownerToken = await login(ownerEmail, "password123");
    return { ownerToken, slug };
  }

  /** Uses "today" (dayOfWeek 0 offset) — the dashboard is scoped to today's Colombo date, unlike other suites which book 2 days out to dodge the same-day lead-time guard. */
  async function bookableFixture(
    ownerToken: string,
    slug: string,
    namePrefix: string,
  ): Promise<{ staffId: string; serviceId: string; priceCents: number; start: string }> {
    const staffId = await createStaff(ownerToken, `${namePrefix} Staff`);
    const priceCents = 500000;
    const serviceId = await createService(ownerToken, `${namePrefix} Service`, 30, priceCents);
    await assignServices(ownerToken, staffId, [serviceId]);
    const date = inWindowDate(0);
    await createSchedule(ownerToken, staffId, dayOfWeekOf(date));

    const availRes = await request(server())
      .post(`/api/v1/salons/${slug}/availability`)
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    const slots = availRes.body.slots as Array<{ start: string }>;
    return { staffId, serviceId, priceCents, start: slots[0].start };
  }

  async function createWalkIn(ownerToken: string, fixture: { serviceId: string; staffId: string }, start: string) {
    const res = await request(server())
      .post("/api/v1/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        newCustomer: { firstName: "Test", lastName: "Customer", phone: uniquePhone() },
        serviceIds: [fixture.serviceId],
        staffId: fixture.staffId,
        start,
        source: "WALK_IN",
      })
      .expect(201);
    return res.body;
  }

  async function nextSlot(slug: string, fixture: { serviceId: string; staffId: string }): Promise<string> {
    const res = await request(server())
      .post(`/api/v1/salons/${slug}/availability`)
      .send({ serviceIds: [fixture.serviceId], date: inWindowDate(0), staffId: fixture.staffId })
      .expect(200);
    return (res.body.slots as Array<{ start: string }>)[0].start;
  }

  it("computes counts, expected revenue, and outstanding for today's appointments only", async () => {
    const { ownerToken, slug } = await provisionTenant("Dashboard Stats");
    const fixture = await bookableFixture(ownerToken, slug, "Dashboard Stats");

    // One CONFIRMED, one CHECKED_IN, one CANCELLED — re-fetching availability
    // before each booking, since array-adjacent slots can overlap once a
    // service's duration exceeds the engine's slot step (P14's DECISIONS.md).
    const confirmed = await createWalkIn(ownerToken, fixture, fixture.start);
    const toCheckIn = await createWalkIn(ownerToken, fixture, await nextSlot(slug, fixture));
    const toCancel = await createWalkIn(ownerToken, fixture, await nextSlot(slug, fixture));

    await request(server())
      .post(`/api/v1/appointments/${toCheckIn.id}/check-in`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    await request(server())
      .post(`/api/v1/appointments/${toCancel.id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "test" })
      .expect(200);

    const res = await request(server())
      .get("/api/v1/dashboard/today")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    assert.equal(res.body.countsByStatus.CONFIRMED, 1);
    assert.equal(res.body.countsByStatus.CHECKED_IN, 1);
    assert.equal(res.body.countsByStatus.CANCELLED, 1);
    assert.equal(res.body.checkedInNow, 1);
    assert.equal(res.body.cancellations, 1);
    // Revenue/outstanding include CONFIRMED + CHECKED_IN, exclude CANCELLED.
    assert.equal(res.body.expectedRevenueCents, fixture.priceCents * 2);
    assert.equal(res.body.outstandingCents, fixture.priceCents * 2);
    void confirmed;
  });

  describe("RBAC", () => {
    it("denies STAFF; allows RECEPTIONIST", async () => {
      const staffToken = await login("staff@demo.salon", "demo1234");
      const receptionist = await login("receptionist@demo.salon", "demo1234");

      await request(server())
        .get("/api/v1/dashboard/today")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);

      await request(server())
        .get("/api/v1/dashboard/today")
        .set("Authorization", `Bearer ${receptionist}`)
        .expect(200);
    });
  });

  describe("cross-tenant isolation", () => {
    it("a fresh tenant's dashboard never includes another tenant's appointments", async () => {
      const { ownerToken: ownerA, slug: slugA } = await provisionTenant("Dashboard Tenant A");
      const fixtureA = await bookableFixture(ownerA, slugA, "Dashboard Tenant A");
      await createWalkIn(ownerA, fixtureA, fixtureA.start);

      const { ownerToken: ownerB } = await provisionTenant("Dashboard Tenant B");
      const res = await request(server())
        .get("/api/v1/dashboard/today")
        .set("Authorization", `Bearer ${ownerB}`)
        .expect(200);

      const totalForB = Object.values(res.body.countsByStatus as Record<string, number>).reduce(
        (sum, n) => sum + n,
        0,
      );
      assert.equal(totalForB, 0);
      assert.equal(res.body.expectedRevenueCents, 0);
    });
  });
});
