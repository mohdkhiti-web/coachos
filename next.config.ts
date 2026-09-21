import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

// next.config runs before the app's env validation, so it reads APP_URL directly.
const appHost = new URL(process.env.APP_URL ?? "http://localhost:3000").host;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // PDF export drives a headless browser from the server (src/modules/exports): keep that package out of the bundle.
  serverExternalPackages: ["playwright-core"],

  experimental: {
    // Server Actions accept only same-origin requests by default (CSRF); list real domains explicitly.
    serverActions: {
      allowedOrigins: [appHost],
      // a logo upload is a Server Action carrying one file: the parsers cap it at 1 MiB, this is the transport's margin
      bodySizeLimit: "2mb",
    },
  },

  // Static hardening headers. The nonce-based CSP is set per request in src/proxy.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // a shared session's address is its secret: never indexed, never cached, never sent on as a referrer
        source: "/s/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
