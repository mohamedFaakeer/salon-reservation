import type {
  ArgumentsHost,
  ExceptionFilter} from "@nestjs/common";
import {
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { isApiError } from "@salon/shared";

/**
 * Global exception filter: every error becomes the ApiError envelope
 * (API.md §7) so clients see one consistent shape:
 * { statusCode, code, message, details?, requestId? }
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toEnvelope(exception);
    res.status(body.statusCode).json(body);
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