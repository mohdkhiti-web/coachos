import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://coachos_app:x@127.0.0.1:5432/coachos",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a minimal development environment and applies defaults", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development" });
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.MAIL_TRANSPORT).toBe("console"); // no Resend key -> dev console mail
    expect(env.AUTH_BREACH_CHECK).toBe(true);
    expect(env.AUTH_RATE_LIMIT).toBe(true);
  });

  it("has safe PDF export defaults and bounds", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development" });
    expect(env).toMatchObject({
      PDF_EXPORT: true,
      PDF_MAX_CONCURRENT: 2,
      PDF_TIMEOUT_MS: 45_000,
      PDF_RATE_PER_MINUTE: 12,
    });
    expect(env.PDF_BROWSER_PATH).toBeUndefined();
    expect(parseEnv({ ...base, NODE_ENV: "development", PDF_EXPORT: "false" }).PDF_EXPORT).toBe(
      false,
    );
    expect(() => parseEnv({ ...base, NODE_ENV: "development", PDF_MAX_CONCURRENT: "50" })).toThrow(
      /PDF_MAX_CONCURRENT/,
    );
    expect(() => parseEnv({ ...base, NODE_ENV: "development", PDF_TIMEOUT_MS: "10" })).toThrow(
      /PDF_TIMEOUT_MS/,
    );
  });

  it("fails fast with a readable message when required values are missing", () => {
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ NODE_ENV: "development" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects a short auth secret", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/at least 32/);
  });

  it("treats empty strings like unset variables", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development", RESEND_API_KEY: "", MAIL_FROM: "" });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.MAIL_FROM).toContain("CoachOS");
  });

  it("selects the Resend transport when a key is present", () => {
    expect(
      parseEnv({ ...base, NODE_ENV: "development", RESEND_API_KEY: "re_123" }).MAIL_TRANSPORT,
    ).toBe("resend");
  });

  it("refuses console/file mail in production (emails would silently never arrive)", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/MAIL_TRANSPORT/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", ALLOW_DEV_MAIL: "true" }),
    ).not.toThrow();
    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", RESEND_API_KEY: "re_123" }),
    ).not.toThrow();
  });

  it("requires a key when resend is selected explicitly", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "development", MAIL_TRANSPORT: "resend" })).toThrow(
      /RESEND_API_KEY/,
    );
  });
});
