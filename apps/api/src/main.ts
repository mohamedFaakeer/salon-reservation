import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { CsrfOriginGuard } from "./common/guards/csrf-origin.guard";
import { RateLimitGuard } from "./common/guards/rate-limit.guard";

async function bootstrap(): Promise<void> {
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

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalGuards(new CsrfOriginGuard(), new RateLimitGuard());

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