import { describe, expect, it } from "vitest";
import { authErrorKey, isEmailNotVerified } from "./auth-errors";
import { buildSetupChecklist } from "./checklist";
import {
  changePasswordSchema,
  deleteAccountSchema,
  fieldErrors,
  onboardingSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./validators";

describe("password rules (NIST-style: length, not composition)", () => {
  const ok = { name: "Ana Diaz", email: "Ana@Example.com", password: "correct horse battery" };

  it("accepts a long passphrase with no symbols/digits and normalises the email", () => {
    const r = signUpSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ana@example.com");
  });

  it("rejects fewer than 12 characters and more than 128", () => {
    const short = signUpSchema.safeParse({ ...ok, password: "elevenchars" });
    expect(short.success).toBe(false);
    if (!short.success) expect(fieldErrors(short.error).password).toContain("password_min");
    const long = signUpSchema.safeParse({ ...ok, password: "x".repeat(129) });
    expect(long.success).toBe(false);
    if (!long.success) expect(fieldErrors(long.error).password).toContain("password_max");
  });

  it("validates emails and names", () => {
    const r = signUpSchema.safeParse({ name: " ", email: "not-an-email", password: ok.password });
    expect(r.success).toBe(false);
    if (!r.success) {
      const f = fieldErrors(r.error);
      expect(f.name).toContain("required");
      expect(f.email).toContain("email_invalid");
    }
  });

  it("sign-in only requires a non-empty password (never reveals rules)", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("reset requires matching confirmation", () => {
    const r = resetPasswordSchema.safeParse({
      password: "a-long-enough-pass",
      confirm: "different-long-pass",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).confirm).toContain("password_mismatch");
  });

  it("change-password rejects reusing the current password and mismatched confirmation", () => {
    const same = changePasswordSchema.safeParse({
      currentPassword: "a-long-enough-pass",
      newPassword: "a-long-enough-pass",
      confirm: "a-long-enough-pass",
    });
    expect(same.success).toBe(false);
    if (!same.success) expect(fieldErrors(same.error).newPassword).toContain("password_same");
  });

  it("account deletion needs the exact typed confirmation", () => {
    expect(deleteAccountSchema.safeParse({ password: "p", confirm: "delete" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "p", confirm: "DELETE" }).success).toBe(true);
  });
});

describe("onboarding schema", () => {
  const valid = { name: "Ana", profession: "coach", timezone: "Europe/Paris" };
  it("accepts valid input", () => expect(onboardingSchema.safeParse(valid).success).toBe(true));
  it("rejects unknown professions and invalid timezones", () => {
    expect(onboardingSchema.safeParse({ ...valid, profession: "admin" }).success).toBe(false);
    const r = onboardingSchema.safeParse({ ...valid, timezone: "Mars/Olympus" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).timezone).toContain("timezone_invalid");
  });
});

describe("authErrorKey", () => {
  it("maps known Better Auth codes to i18n keys and never leaks library text", () => {
    expect(authErrorKey({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("invalidCredentials");
    expect(authErrorKey({ code: "INVALID_PASSWORD" })).toBe("invalidPassword");
    expect(authErrorKey({ code: "PASSWORD_COMPROMISED" })).toBe("passwordCompromised");
    expect(authErrorKey({ code: "INVALID_TOKEN" })).toBe("invalidToken");
    expect(authErrorKey({ status: 429, code: "ANYTHING" })).toBe("rateLimited");
    expect(authErrorKey({ code: "SOMETHING_NEW", message: "raw library text" })).toBe("generic");
    expect(authErrorKey(null)).toBe("generic");
  });
  it("detects the unverified-email case", () => {
    expect(isEmailNotVerified({ code: "EMAIL_NOT_VERIFIED" })).toBe(true);
    expect(isEmailNotVerified({ code: "OTHER" })).toBe(false);
  });
});

describe("buildSetupChecklist (derived from real state)", () => {
  const profile = {
    profession: "coach" as const,
    timezone: "UTC",
    onboardingCompleted: true,
    preferencesReviewed: false,
  };

  it("marks items from actual account state", () => {
    const items = buildSetupChecklist({ user: { emailVerified: true, name: "Ana" }, profile });
    expect(items.map((i) => [i.id, i.done])).toEqual([
      ["email_verified", true],
      ["profile_complete", true],
      ["preferences", false],
    ]);
    expect(items.find((i) => i.id === "preferences")?.href).toBe("/settings/preferences");
  });

  it("an incomplete profile is not 'complete', and reviewing preferences completes that item", () => {
    const incomplete = buildSetupChecklist({
      user: { emailVerified: true, name: "Ana" },
      profile: { ...profile, profession: null, onboardingCompleted: false },
    });
    expect(incomplete.find((i) => i.id === "profile_complete")?.done).toBe(false);

    const reviewed = buildSetupChecklist({
      user: { emailVerified: true, name: "Ana" },
      profile: { ...profile, preferencesReviewed: true },
    });
    expect(reviewed.every((i) => i.done)).toBe(true);
  });
});
