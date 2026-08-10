/**
 * Error envelope shared across the API (API.md §7).
 *
 * Every controller error is serialized into this shape so the frontends can
 * render a specific, actionable message:
 *
 * ```json
 * {
 *   "statusCode": 409,
 *   "code": "SLOT_UNAVAILABLE",
 *   "message": "That slot was just booked by another customer.",
 *   "details": { "conflictingStaffId": "…" },
 *   "requestId": "req_…"
 * }
 * ```
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(params: {
    statusCode: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}