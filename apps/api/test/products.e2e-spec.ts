import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret-min-32-characters-long";

describe("Products (e2e) — cross-tenant isolation", () => {
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

  /** A fresh tenant defaults to PRO (DEFAULT_TENANT_ENTITLEMENTS), so "inventory" is already enabled — no entitlements dance needed. */
  async function provisionTenant(namePrefix: string): Promise<string> {
    const superToken = await login("super.admin@salon.local", "super-admin-demo-password-2026");
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const ownerEmail = `owner-${unique}@products-e2e.test`;
    await request(server())
      .post("/api/v1/super-admin/tenants")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        salonName: `${namePrefix} Salon`,
        slug: `products-e2e-${unique}`,
        ownerName: "Tenant B Owner",
        ownerEmail,
        ownerPassword: "password123",
      })
      .expect(201);
    return login(ownerEmail, "password123");
  }

  it("cross-tenant: a product created under one tenant 404s for another tenant's owner, and never appears in its list", async () => {
    const tenantAOwner = await login("owner@demo.salon", "demo1234");
    const created = await request(server())
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${tenantAOwner}`)
      .send({ name: `Cross Tenant Shampoo ${Date.now()}` })
      .expect(201);

    const tenantBOwner = await provisionTenant("Products Cross Tenant B");
    await request(server())
      .get(`/api/v1/products/${created.body.id}`)
      .set("Authorization", `Bearer ${tenantBOwner}`)
      .expect(404);

    const list = await request(server())
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${tenantBOwner}`)
      .expect(200);
    const ids = (list.body.data as Array<{ id: string }>).map((p) => p.id);
    assert.ok(!ids.includes(created.body.id));
  });
});
