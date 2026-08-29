import type {
  ArgumentsHost,
  ExceptionFilter} from "@nestjs/common";
import {
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Repository } from "typeorm";
import { isApiError } from "@salon/shared";
import type { ErrorLog } from "../../entities/error-log.entity";
import type { AuthenticatedRequest } from "../../tenant/tenant-context";

/**
 * Global exception filter: every error becomes the ApiError envelope
 * (API.md §7) so clients see one consistent shape:
 * { statusCode, code, message, details?, requestId? }
 *
 * The error log line deliberately includes only method/path/code/requestId
 * — never the request body — since booking/customer routes carry phones and
 * emails (SECURITY.md §9: "no PII in logs").
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");

  /**
   * Optional and supplied via `app.get(getRepositoryToken(ErrorLog))` in
   * main.ts — this filter is instantiated outside Nest's DI container
   * (`app.useGlobalFilters(new ApiExceptionFilter())`), same situation as
   * `RateLimitGuard`. Without it (e.g. any future direct instantiation),
   * behavior is unchanged: console logging only, same as before this table
   * existed.
   */
  constructor(private readonly errorLogs?: Repository<ErrorLog>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toEnvelope(exception);
    body.requestId = body.requestId ?? req.requestId;

    if (body.statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${req.method} ${req.originalUrl} ${body.statusCode} ${body.code} [${body.requestId}]`,
        stack,
      );
      this.persistErrorLog(req, body, stack);
    } else {
      this.logger.warn(
        `${req.method} ${req.originalUrl} ${body.statusCode} ${body.code} [${body.requestId}]`,
      );
    }

    res.status(body.statusCode).json(body);
  }

  /**
   * Deliberately not awaited — this project has no third-party error
   * tracker, so this table is the only historical record of what broke, but
   * writing it must never add latency to (or risk of failing) the response
   * a real user is waiting on. Same "logging must not become the outage"
   * principle as the console log line above it.
   */
  private persistErrorLog(
    req: Request,
    body: { statusCode: number; code: string; message: string; requestId?: string },
    stack: string | undefined,
  ): void {
    if (!this.errorLogs) {
      return;
    }
    const tenantId = (req as AuthenticatedRequest).tenantContext?.tenantId ?? null;
    this.errorLogs
      .save(
        this.errorLogs.create({
          tenantId,
          requestId: body.requestId ?? null,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          statusCode: body.statusCode,
          code: body.code,
          // Same sanitized text already deemed safe for the console line —
          // never the raw request body (SECURITY.md §9).
          message: body.message.slice(0, 500),
          stack: stack ? stack.slice(0, 4000) : null,
        }),
      )
      .catch((err: unknown) => {
        this.logger.error("Failed to persist error_log row", err instanceof Error ? err.stack : undefined);
      });
  }

  private toEnvelope(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  } {
    if (isApiError(exception)) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId: exception.requestId,
      };
    }

    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse();
      const errors =
        typeof payload === "object" && payload !== null && "message" in payload
          ? (payload as { message: string | string[] }).message
          : exception.message;
      return {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Validation failed.",
        details: { errors },
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "string"
          ? payload
          : ((payload as { message?: string }).message ?? exception.message);
      return { statusCode, code: `HTTP_${statusCode}`, message };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Something went wrong.",
    };
  }
}