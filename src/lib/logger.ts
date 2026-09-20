import pino from "pino";
import { env } from "@/lib/env";

/**
 * Structured JSON logs. Redaction list follows ARCHITECTURE.md §3.4:
 * never log credentials, tokens, participant names or free-text notes.
 */
export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  base: { service: "coachos" },
  redact: {
    paths: [
      "password",
      "*.password",
      "newPassword",
      "currentPassword",
      "token",
      "*.token",
      "url",
      "authorization",
      "cookie",
      "headers.cookie",
      "headers.authorization",
      "email",
      "*.email",
      "participant",
      "notes",
    ],
    censor: "[redacted]",
  },
});

export function childLogger(bindings: Record<string, string | number | undefined>) {
  return logger.child(bindings);
}
