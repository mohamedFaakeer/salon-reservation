import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";
import { TokenService } from "../src/auth/services/token.service";
import { SessionService } from "../src/auth/services/session.service";

// TokenService requires JWT_SECRET at construction time (compile of AppModule).
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

describe("Auth (e2e)", () => {
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

  const credentials = { email: "owner@demo.salon", password: "demo1234" };

  function cookieValue(setCookies: string[], name: "salon_session"): string {
    const raw = setCookies.find((c) => c.startsWith(`${name}=`));
    assert.ok(raw, `Set-Cookie with ${name} not present`);
    return raw.split(";")[0].slice(`${name}=`.length);
  }

  it("POST /api/v1/auth/login → 200 with access token + httponly refresh cookie", async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/v1/auth/login")
      .send(credentials)
      .expect(201);

    assert.equal(res.body.user.email, credentials.email);
    assert.equal(res.body.user.name, "Demo Owner");
    assert.ok(res.body.user.tenantId, "owner is tenant-scoped");
    assert.deepEqual(res.body.user.roles, ["OWNER"]);
    assert.ok(res.body.accessToken.startsWith("eyJ"), "JWT access token");

    const cookie = cookieValue(
      res.headers["set-cookie"] as unknown as string[],
      "salon_session",
    );
    assert.ok(cookie.length > 20, "refresh token is opaque & random");
  });

  it("POST /api/v1/auth/login with wrong password → 401 INVALID_CREDENTIALS", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: credentials.email, password: "wrong-password" })
      .expect(401);
    assert.equal(res.body.code, "INVALID_CREDENTIALS");
  });

  it("rotates the refresh cookie and revokes the whole family on reuse", async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post("/api/v1/auth/login")
      .send(credentials)
      .expect(201);

    const firstRefresh = cookieValue(
      login.headers["set-cookie"] as unknown as string[],
      "salon_session",
    );
    const rot1 = await agent.post("/api/v1/auth/refresh").expect(201);
    const secondRefresh = cookieValue(
      rot1.headers["set-cookie"] as unknown as string[],
      "salon_session",
    );
    assert.notEqual(secondRefresh, firstRefresh, "token must rotate");

    // Reuse of the already-rotated token → family revoked → 401
    const reuse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `salon_session=${firstRefresh}`)
      .expect(401);
    assert.equal(reuse.body.code, "UNAUTHENTICATED");

    // Even the still-live current token is now dead (session chain killed)
    await agent.post("/api/v1/auth/refresh").expect(401);
  });

  it("logs out and clears the refresh cookie", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/v1/auth/login").send(credentials).expect(201);

    const res = await agent.post("/api/v1/auth/logout").expect(201);
    assert.deepEqual(res.body, { ok: true });
    const cleared = res.headers["set-cookie"] as unknown as string[];
    assert.ok(
      cleared.some((c) => c.startsWith("salon_session=;") && c.includes("Path=/")),
      "refresh cookie is cleared",
    );

    // After logout the same agent session is dead
    await agent.post("/api/v1/auth/refresh").expect(401);
  });

  // S10 (SECURITY.md §11): tampered JWT signature → 401
  it("rejects a bearer token with a tampered signature", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send(credentials)
      .expect(201);

    const parts = (login.body.accessToken as string).split(".");
    const tamperedChar = parts[2][0] === "A" ? "B" : "A";
    parts[2] = tamperedChar + parts[2].slice(1);
    const tampered = parts.join(".");

    const res = await request(app.getHttpServer())
      .get("/api/v1/tenant/me")
      .set("Authorization", `Bearer ${tampered}`)
      .expect(401);
    assert.equal(res.body.code, "TOKEN_INVALID");
  });

  // S11 (SECURITY.md §11): expired access token → 401; refresh flow recovers
  it("rejects an expired access token, and refresh issues a working replacement", async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post("/api/v1/auth/login")
      .send(credentials)
      .expect(201);

    const tokens = app.get(TokenService);
    const sessions = app.get(SessionService);
    const sessionUser = await sessions.buildSessionUser(login.body.user.id);
    const expiredToken = await tokens.sign(sessionUser, "-1s");

    const expired = await request(app.getHttpServer())
      .get("/api/v1/tenant/me")
      .set("Authorization", `Bearer ${expiredToken}`)
      .expect(401);
    assert.equal(expired.body.code, "TOKEN_INVALID");

    const refreshed = await agent.post("/api/v1/auth/refresh").expect(201);
    await request(app.getHttpServer())
      .get("/api/v1/tenant/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
  });
});