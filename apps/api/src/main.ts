import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { Repository } from "typeorm";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { CsrfOriginGuard } from "./common/guards/csrf-origin.guard";
import { RateLimitGuard } from "./common/guards/rate-limit.guard";
import { assertProductionSecrets } from "./common/security/production-secrets";
import { AuditService } from "./audit/audit.service";
import { ErrorLog } from "./entities/error-log.entity";

async function bootstrap(): Promise<void> {
  // Before Nest builds anything: a production process must never start
  // holding a secret that is published in this repository.
  assertProductionSecrets(process.env);

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const corsOrigins = (config.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  // RateLimitGuard and ApiExceptionFilter are instantiated manually (outside
  // Nest's DI container) because they must be active before/around the
  // module tree in a way `APP_GUARD`/`APP_FILTER` providers don't guarantee
  // for this pair. `app.get(...)` after `NestFactory.create()` is the
  // standard way to hand a manually-constructed instance a DI-resolved
  // dependency without converting it into a full module provider — see the
  // super-admin monitoring feature's DECISIONS.md entry for why that
  // (bigger, riskier) refactor was deliberately avoided here.
  const auditService = app.get(AuditService);
  const errorLogRepo = app.get<Repository<ErrorLog>>(getRepositoryToken(ErrorLog));

  app.useGlobalFilters(new ApiExceptionFilter(errorLogRepo));
  app.useGlobalGuards(new CsrfOriginGuard(), new RateLimitGuard(auditService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Salon Reservation API")
    .setDescription("Salon Reservation SaaS MVP — REST API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(config.get<number>("PORT") ?? 3000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`API listening on http://localhost:${port}/api/v1`, "Bootstrap");
  Logger.log(`OpenAPI docs on http://localhost:${port}/api/docs`, "Bootstrap");
}

void bootstrap();