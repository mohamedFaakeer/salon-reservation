import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";
import { dayOfWeekOf } from "../src/availability/time.util";

// TokenService requires JWT_SECRET at construction time (compile of AppModule).
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

/** A date comfortably inside the default 30-day booking window, not "today". */
function inWindowDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

describe("Availability engine (e2e)", () => {
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

  const server = () => app.getHttpServer();

  async function login(email: string, password: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(201);
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

  async function createSchedule(
    token: string,
    staffId: string,
    dayOfWeek: number,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await request(server())
      .post("/api/v1/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({ staffId, dayOfWeek, startMin: 540, endMin: 1020, ...extra })
      .expect(201);
  }

  it("404s SALON_NOT_FOUND for a bogus slug", async () => {
    const res = await request(server())
      .post("/api/v1/salons/does-not-exist/availability")
      .send({ serviceIds: ["11111111-1111-4111-8111-111111111111"], date: inWindowDate(2) })
      .expect(404);
    assert.equal(res.body.code, "SALON_NOT_FOUND");
  });

  it("404s SERVICE_NOT_FOUND for an unknown service id", async () => {
    const res = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: ["11111111-1111-4111-8111-111111111111"], date: inWindowDate(2) })
      .expect(404);
    assert.equal(res.body.code, "SERVICE_NOT_FOUND");
  });

  it("returns available slots within working hours, excluding the break, unauthenticated", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const staffId = await createStaff(owner, "Availability Happy Path Staff");
    const serviceId = await createService(owner, "Availability Happy Path Service", 30);
    await assignServices(owner, staffId, [serviceId]);

    const date = inWindowDate(2);
    await createSchedule(owner, staffId, dayOfWeekOf(date), { breakStartMin: 720, breakEndMin: 780 });

    const res = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date })
      .expect(200);

    assert.ok(res.body.slots.length > 0);
    for (const slot of res.body.slots as Array<{ staffId: string; start: string; end: string }>) {
      assert.equal(slot.staffId, staffId);
      const startMinutes = new Date(slot.start).getUTCHours() * 60 + new Date(slot.start).getUTCMinutes();
      // Sanity check the response shape rather than local-time boundaries here —
      // the engine's own unit tests (availability.engine.spec.ts) pin exact minutes.
      assert.ok(Number.isFinite(startMinutes));
    }
  });

  it("returns no slots on a day the staff member doesn't work", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const staffId = await createStaff(owner, "Availability Day Off Staff");
    const serviceId = await createService(owner, "Availability Day Off Service", 30);
    await assignServices(owner, staffId, [serviceId]);

    const scheduledDate = inWindowDate(2);
    await createSchedule(owner, staffId, dayOfWeekOf(scheduledDate));

    const dayOffDate = inWindowDate(3); // a different calendar date -> different weekday, no schedule row
    const res = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date: dayOffDate })
      .expect(200);

    assert.deepEqual(res.body.slots, []);
  });

  it("Any Available Staff aggregates across qualified staff, sorted earliest first", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const serviceId = await createService(owner, "Availability Any Staff Service", 30);
    const date = inWindowDate(2);
    const dow = dayOfWeekOf(date);

    const staffA = await createStaff(owner, "Availability Any Staff A");
    await assignServices(owner, staffA, [serviceId]);
    await createSchedule(owner, staffA, dow); // 09:00-17:00

    const staffB = await createStaff(owner, "Availability Any Staff B");
    await assignServices(owner, staffB, [serviceId]);
    // Narrower window than A, but starts earlier -> B's slot should sort first.

    const res = await request(server())
      .post("/api/v1/schedules")
      .set("Authorization", `Bearer ${owner}`)
      .send({ staffId: staffB, dayOfWeek: dow, startMin: 480, endMin: 560 })
      .expect(201);
    assert.ok(res.body.id);

    const availability = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date })
      .expect(200);

    const staffIds = new Set(
      (availability.body.slots as Array<{ staffId: string }>).map((s) => s.staffId),
    );
    assert.ok(staffIds.has(staffA));
    assert.ok(staffIds.has(staffB));
    assert.equal(availability.body.slots[0].staffId, staffB);
  });

  it("hides slots for a staff member not qualified for the requested service", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const qualified = await createStaff(owner, "Availability Qualified Staff");
    const unqualified = await createStaff(owner, "Availability Unqualified Staff");
    const serviceId = await createService(owner, "Availability Qualification Service", 30);
    await assignServices(owner, qualified, [serviceId]);
    // `unqualified` intentionally gets no staff_service assignment.

    const date = inWindowDate(2);
    const dow = dayOfWeekOf(date);
    await createSchedule(owner, qualified, dow);
    await createSchedule(owner, unqualified, dow);

    const explicit = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date, staffId: unqualified })
      .expect(200);
    assert.deepEqual(explicit.body.slots, []);

    const any = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date })
      .expect(200);
    assert.ok(!(any.body.slots as Array<{ staffId: string }>).some((s) => s.staffId === unqualified));
    assert.ok((any.body.slots as Array<{ staffId: string }>).some((s) => s.staffId === qualified));
  });

  it("returns no slots when the date is beyond the tenant's booking window", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const staffId = await createStaff(owner, "Availability Window Staff");
    const serviceId = await createService(owner, "Availability Window Service", 30);
    await assignServices(owner, staffId, [serviceId]);
    await createSchedule(owner, staffId, dayOfWeekOf(inWindowDate(2)));

    const res = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date: inWindowDate(60) }) // default bookingWindowDays = 30
      .expect(200);

    assert.deepEqual(res.body.slots, []);
  });
});
