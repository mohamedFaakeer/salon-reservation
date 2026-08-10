import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

describe("App (e2e)", () => {
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

  it("GET /api/v1/health → 200 { status: ok }", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    assert.equal(res.body.status, "ok");
    assert.equal(typeof res.body.timestamp, "string");
  });
});