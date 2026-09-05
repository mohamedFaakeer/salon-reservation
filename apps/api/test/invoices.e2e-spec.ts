import { describe, it, before, after } from "node:test";
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

/** A fresh tenant defaults to PRO (DEFAULT_TENANT_ENTITLEMENTS), so "invoices" is already enabled — no entitlements dance needed. */
describe("Invoices (e2e) — cross-tenant isolation", () => {
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

  async function provisionTenant(namePrefix: string): Promise<string> {
    const superToken = await login("super.admin@salon.local", "super-admin-demo-password-2026");
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const ownerEmail = `owner-${unique}@invoices-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug: `invoices-e2e-${unique}`,
        ownerName: "Tenant B Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);
    return login(ownerEmail, "password123");
  }

  async function bookableFixture(
    ownerToken: string,
    namePrefix: string,
  ): Promise<{ staffId: string; serviceId: string; slotStart: string }> {
    const staffRes = await request(server())
      .post("/api/v1/staff")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `${namePrefix} Staff` })
      .expect(201);
    const staffId = staffRes.body.id as string;

    const serviceRes = await request(server())
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: `${namePrefix} Service`, durationMin: 30, priceCents: 500000 })
      .expect(201);
    const serviceId = serviceRes.body.id as string;

    await request(server())
      .put(`/api/v1/staff/${staffId}/services`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceIds: [serviceId] })
      .expect(200);

    const date = inWindowDate(2);
    await request(server())
      .post("/api/v1/schedules")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, dayOfWeek: dayOfWeekOf(date), startMin: 540, endMin: 1020 })
      .expect(201);

    const availRes = await request(server())
      .post("/api/v1/salons/elegance/availability")
      .send({ serviceIds: [serviceId], date, staffId })
      .expect(200);
    return { staffId, serviceId, slotStart: availRes.body.slots[0].start as string };
  }

  it("cross-tenant: an invoice issued under one tenant 404s for another tenant's owner", async () => {
    const tenantAOwner = await login("owner@demo.salon", "demo1234");
    const { staffId, serviceId, slotStart } = await bookableFixture(tenantAOwner, "Invoices Cross Tenant");
    const appointment = await request(server())
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

    const invoice = await request(server())
      .post(`/api/v1/appointments/${appointment.body.id}/invoices`)
      .set("Authorization", `Bearer ${tenantAOwner}`)
      .expect(201);

    const tenantBOwner = await provisionTenant("Invoices Cross Tenant B");
    await request(server())
      .get(`/api/v1/invoices/${invoice.body.id}`)
      .set("Authorization", `Bearer ${tenantBOwner}`)
      .expect(404);
  });
});
