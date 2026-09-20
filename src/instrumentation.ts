import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast at boot if the environment is misconfigured (ARCHITECTURE.md §3.6).
    await import("@/lib/env");
  }
}

// Server-side error reporting. Sentry / OpenTelemetry plug in here later (§21.4); for now,
// structured, redacted logs with the error digest so a user-visible error id can be traced.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest: unknown }).digest)
      : undefined;
  logger.error(
    {
      err: err instanceof Error ? err.message : String(err),
      digest,
      path: request.path.split("?")[0], // never log query strings (tokens)
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    "request.error",
  );
};
