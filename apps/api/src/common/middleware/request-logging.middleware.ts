import crypto from "node:crypto";
import type { NestMiddleware } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

declare module "express" {
  interface Request {
    requestId?: string;
  }
}

/**
 * Assigns a request id (reusing an inbound X-Request-Id if the caller sent
 * one) and logs method/path/status/duration only — deliberately never the
 * body or query string, since booking/customer routes carry phones and
 * emails (SECURITY.md §9: "request logging with requestId; no PII in logs").
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers["x-request-id"]?.toString() || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = Date.now();
    res.on("finish", () => {
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms [${requestId}]`,
      );
    });

    next();
  }
}
