import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Proxy = OPTIMISTIC checks + per-request CSP nonce (ARCHITECTURE.md §5.4, §19.3).
 *
 * It only looks for the *presence* of a session cookie to save a round trip for obviously
 * signed-out visitors. It is NOT authorization: the real check is `requireViewer()` (database
 * session) in every page and Server Action, because Proxy is skipped for prefetches and for
 * matcher-excluded paths ("should not be your only line of defense").
 *
 * Nonce CSP forces dynamic rendering of every page — the trade-off recorded in §19.5.
 * (Independent of shared modules on purpose; reads NODE_ENV directly.)
 */

const COOKIE_PREFIX = "coachos"; // keep in sync with `advanced.cookiePrefix` in identity/auth.ts
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/onboarding"];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets nonce-carrying framework scripts load their chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Dev only: Turbopack's dev server injects un-nonced <style> tags for hot reload. Production stays nonce-only
    // (verified clean by the e2e "CSP breaks nothing" test, which runs against a production build).
    isDev ? `style-src 'self' 'unsafe-inline'` : `style-src 'self' 'nonce-${nonce}'`,
    // Inline style *attributes* (positioning by Radix/Floating UI) cannot execute script; allowing
    // them is a deliberate, narrow exception rather than opening style-src globally.
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
  // Only when actually served over HTTPS — on http://localhost (local prod-build testing) it would
  // rewrite every asset request to https and break the page.
  if (!isDev && (process.env.APP_URL ?? "").startsWith("https://"))
    directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX })) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
