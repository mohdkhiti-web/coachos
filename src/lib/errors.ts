import type { ErrorCode } from "@/lib/result";

/** For genuinely unexpected/programmer errors and framework boundaries (route handlers). */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  ENTITLEMENT_EXCEEDED: 402,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_CREDENTIALS: 401,
  PASSWORD_COMPROMISED: 422,
  INVALID_TOKEN: 400,
  FRESH_SESSION_REQUIRED: 403,
  INTERNAL: 500,
};

export function httpStatus(code: ErrorCode): number {
  return STATUS[code];
}

/** RFC 9457 problem-details response for route handlers. */
export function problem(code: ErrorCode, detail?: string): Response {
  const status = httpStatus(code);
  return new Response(JSON.stringify({ type: `about:blank`, title: code, status, detail }), {
    status,
    headers: { "content-type": "application/problem+json", "cache-control": "private, no-store" },
  });
}
