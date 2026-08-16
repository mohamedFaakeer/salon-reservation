import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

/** Unique phone per run — the DB is persistent across e2e runs, so fixed numbers would collide. */
let phoneCounter = 0;
function uniquePhone(): string {
  const suffix = `${Date.now()}${phoneCounter++}`.slice(-8);
  return `077${suffix}`;
}

describe("Customers (e2e)", () => {
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

  it("denies STAFF; allows OWNER/MANAGER/RECEPTIONIST", async () => {
    const staff = await login("staff@demo.salon", "demo1234");
    await request(server())
      .get("/api/v1/customers")
      .set("Authorization", `Bearer ${staff}`)
      .expect(403);
    await request(server())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${staff}`)
      .send({ firstName: "A", lastName: "B", phone: uniquePhone() })
      .expect(403);

    const receptionist = await login("receptionist@demo.salon", "demo1234");
    await request(server())
      .get("/api/v1/customers")
      .set("Authorization", `Bearer ${receptionist}`)
      .expect(200);
  });

  it("creates a customer and finds it by id", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const phone = uniquePhone();
    const email = `nimali-${Date.now()}@example.com`;
    const created = await request(server())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${owner}`)
      .send({ firstName: "Nimali", lastName: "Perera", phone, email })
      .expect(201);
    assert.equal(created.body.phone, phone);
    assert.equal(created.body.email, email);

    const fetched = await request(server())
      .get(`/api/v1/customers/${created.body.id}`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.equal(fetched.body.firstName, "Nimali");
  });

  it("rejects a duplicate phone with 409 DUPLICATE_CUSTOMER and the existing record", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    const phone = uniquePhone();
    const first = await request(server())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${owner}`)
      .send({ firstName: "Sanduni", lastName: "Silva", phone })
      .expect(201);

    // Same number, different formatting — normalization must still catch it.
    const spaced = `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
    const dup = await request(server())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${owner}`)
      .send({ firstName: "Someone", lastName: "Else", phone: spaced })
      .expect(409);
    assert.equal(dup.body.code, "DUPLICATE_CUSTOMER");
    assert.equal(dup.body.details.existing.id, first.body.id);
  });

  it("searches by name/phone substring", async () => {
    const owner = await login("owner@demo.salon", "demo1234");
    await request(server())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${owner}`)
      .send({ firstName: "Uniquename123", lastName: "Searchable", phone: uniquePhone() })
      .expect(201);

    const res = await request(server())
      .get("/api/v1/customers?q=Uniquename123")
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    assert.ok(res.body.some((c: { firstName: string }) => c.firstName === "Uniquename123"));
  });

  it("cross-tenant: a customer created under one tenant 404s for another tenant's owner", async () => {
    const superToken = await login("super.admin@salon.local", "super-admin-demo-password-2026");
    const unique = Date.now();
    const ownerEmail = `owner-${unique}@customers-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: "Customers E2E Salon",
        slug: `customers-e2e-${unique}`,
        ownerName: "Tenant B Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);

    const tenantAOwner = await login("owner@demo.salon", "demo1234");
    const created = await request(server())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${tenantAOwner}`)
      .send({ firstName: "Cross", lastName: "Tenant", phone: uniquePhone() })
      .expect(201);

    const tenantBOwner = await login(ownerEmail, "password123");
    await request(server())
      .get(`/api/v1/customers/${created.body.id}`)
      .set("Authorization", `Bearer ${tenantBOwner}`)
      .expect(404);
  });
});
