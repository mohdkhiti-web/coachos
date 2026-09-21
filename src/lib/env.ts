import { z } from "zod";

/**
 * The single place that reads `process.env` (ARCHITECTURE.md §3.6).
 * Validated once at boot so a misconfigured deploy fails fast instead of at first request.
 */

const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

// Treat `KEY=` (empty) in .env files the same as an unset variable.
type RawEnv = Record<string, string | undefined>;

const emptyToUndefined = (raw: RawEnv) =>
  Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required (runtime role: coachos_app)"),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (try: openssl rand -base64 32)"),
    AUTH_BREACH_CHECK: bool(true),
    AUTH_RATE_LIMIT: bool(true),

    MAIL_TRANSPORT: z.enum(["console", "file", "resend"]).optional(),
    MAIL_FROM: z.string().min(3).default("CoachOS <no-reply@localhost>"),
    MAIL_FILE_DIR: z.string().default(".data/mail"),
    RESEND_API_KEY: z.string().optional(),
    ALLOW_DEV_MAIL: bool(false),

    // PDF export (ARCHITECTURE.md §13.8): a headless Chromium prints the app's own print route. The browser is found
    // automatically (system Chrome/Edge/Chromium); set PDF_BROWSER_PATH to name one. PDF_EXPORT=false switches it off.
    PDF_EXPORT: bool(true),
    PDF_BROWSER_PATH: z.string().optional(),
    PDF_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(2),
    PDF_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(12),
    PDF_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),

    // Share links (Step 7) are signed with a key derived from this (default: the auth secret). Changing it revokes every link.
    SHARE_SECRET: z.string().min(32, "SHARE_SECRET must be at least 32 characters").optional(),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((v, ctx) => {
    const transport = v.MAIL_TRANSPORT ?? (v.RESEND_API_KEY ? "resend" : "console");
    if (transport === "resend" && !v.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when MAIL_TRANSPORT=resend",
      });
    }
    // Emails that only go to a console/file never reach real users. Refuse that in
    // production unless it is an explicit decision (e.g. running the e2e suite on a prod build).
    if (v.NODE_ENV === "production" && transport !== "resend" && !v.ALLOW_DEV_MAIL) {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message:
          "Production requires MAIL_TRANSPORT=resend (set ALLOW_DEV_MAIL=true only for local prod-build testing)",
      });
    }
  })
  .transform((v) => ({
    ...v,
    MAIL_TRANSPORT:
      v.MAIL_TRANSPORT ?? (v.RESEND_API_KEY ? ("resend" as const) : ("console" as const)),
    isProduction: v.NODE_ENV === "production",
  }));

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: RawEnv): Env {
  const parsed = schema.safeParse(emptyToUndefined(raw));
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  return parsed.data;
}

export const env: Env = parseEnv(process.env);
