import { uuidv7 } from "uuidv7";

/**
 * UUIDv7 primary keys (ARCHITECTURE.md §4.1): time-ordered for index locality, non-enumerable
 * (defence in depth against IDOR), and safe to generate outside the database.
 */
export function newId(): string {
  return uuidv7();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
