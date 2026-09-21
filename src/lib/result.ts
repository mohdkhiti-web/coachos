/**
 * Typed results for Server Actions and commands (ARCHITECTURE.md §3.3 / §3.4).
 * Expected failures are *returned*, never thrown. Messages are i18n keys resolved in the UI
 * from `error.code` / `error.fields`, so server code stays language-agnostic.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "ENTITLEMENT_EXCEEDED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_CREDENTIALS"
  | "PASSWORD_COMPROMISED"
  | "INVALID_TOKEN"
  | "FRESH_SESSION_REQUIRED"
  | "INTERNAL";

/** field name -> validation message keys (see `validation.*` in messages/en.json) */
export type FieldErrors = Record<string, string[]>;

export type Failure = {
  code: ErrorCode;
  fields?: FieldErrors;
};

export type Result<T = void> =
  { ok: true; data: T } | { ok: false; error: Failure; values?: Record<string, string> };

export function ok(): Result<void>;
export function ok<T>(data: T): Result<T>;
export function ok<T>(data?: T): Result<T | undefined> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  extra: { fields?: FieldErrors; values?: Record<string, string> } = {},
): Result<never> {
  return { ok: false, error: { code, fields: extra.fields }, values: extra.values };
}

/** State shape consumed by `useActionState` forms. `null` = not submitted yet. */
export type FormState<T = void> = Result<T> | null;
