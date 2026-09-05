import { describe, it, before, after } from "node:test";
import crypto from "node:crypto";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

let phoneCounter = 0;
function uniquePhone(): string {
  const suffix = `${Date.now()}${phoneCounter++}`.slice(-8);
  return `077${suffix}`;
}

describe("Gift cards (e2e) — cross-tenant isolation", () => {
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
    const ownerEmail = `owner-${unique}@gift-cards-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug: `gift-cards-e2e-${unique}`,
        ownerName: "Tenant B Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);
    return login(ownerEmail, "password123");
  }

  function futureDate(daysAhead: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  }

  it("cross-tenant: a gift card issued under one tenant 404s for another tenant's owner", async () => {
    const tenantAOwner = await login("owner@demo.salon", "demo1234");
    const created = await request(server())
      .post("/api/v1/gift-cards")
      .set("Authorization", `Bearer ${tenantAOwner}`)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        amountCents: 500000,
        expiresAt: futureDate(365),
        purchaser: { firstName: "Cross", lastName: "Tenant", phone: uniquePhone() },
        paymentMethod: "CASH",
      })
      .expect(201);

    const tenantBOwner = await provisionTenant("Gift Cards Cross Tenant B");
    await request(server())
      .get(`/api/v1/gift-cards/${created.body.id}`)
      .set("Authorization", `Bearer ${tenantBOwner}`)
      .expect(404);
  });
});
