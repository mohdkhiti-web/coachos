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

    // Session generator (Step 8): how many generations one person may ask for per minute (rules only — no AI, no cost).
    GENERATOR_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(40),

    // AI Coaching Assistant (Step 8). Provider-neutral: AI_PROVIDER names the adapter; with none, or without its key, the
    // assistant says it is unavailable and everything else keeps working. "scripted" is a deterministic stand-in for tests
    // (never for a real deployment: production refuses it unless ALLOW_DEV_AI is set, like ALLOW_DEV_MAIL).
    AI_PROVIDER: z.enum(["anthropic", "scripted"]).optional(),
    ANTHROPIC_API_KEY: z.string().min(10).optional(),
    AI_MODEL: z.string().min(3).max(80).default("claude-opus-5"),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16_000).default(4_000),
    AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(60_000),
    AI_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(12),
    AI_DAILY_MESSAGES: z.coerce.number().int().min(1).max(10_000).default(150),
    ALLOW_DEV_AI: bool(false),

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
    if (v.AI_PROVIDER === "anthropic" && !v.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic",
      });
    }
    if (v.NODE_ENV === "production" && v.AI_PROVIDER === "scripted" && !v.ALLOW_DEV_AI) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_PROVIDER"],
        message:
          "AI_PROVIDER=scripted is a test stand-in: production refuses it (set ALLOW_DEV_AI=true only for local prod-build testing)",
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
