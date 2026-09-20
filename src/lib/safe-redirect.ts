/**
 * Open-redirect defence for `?next=` parameters. Only same-origin paths under known app areas are
 * honoured; anything else falls back to the dashboard.
 */
const ALLOWED_PREFIXES = ["/dashboard", "/settings", "/onboarding"];

export function safeNext(
  value: string | string[] | undefined | null,
  fallback = "/dashboard",
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  // must be a rooted path; "//host" and "/\host" are protocol-relative / browser-normalised escapes
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  const path = raw.split(/[?#]/)[0] ?? "";
  const allowed = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  return allowed ? raw : fallback;
}
