import { z } from "zod";
import {
  COACH_AGE_GROUPS,
  COACH_LIMITS,
  COACH_NEEDS,
  COACH_PRIORITIES,
  COACHING_EXPERIENCES,
  COACHING_STYLES,
  PROFESSIONS,
  UNITS,
} from "@/db/enums";

/**
 * Zod schemas shared by client forms and server actions (one validation source, §2.4).
 * Error messages are i18n keys under `validation.*` — never English strings.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const emailSchema = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(254, { error: "too_long" })
  .pipe(z.email({ error: "email_invalid" }))
  .transform((v) => v.toLowerCase());

export const nameSchema = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(80, { error: "too_long" });

/** NIST 800-63B direction: length over composition rules; breached-password check runs server-side. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, { error: "password_min" })
  .max(PASSWORD_MAX, { error: "password_max" });

export const professionSchema = z.enum(PROFESSIONS, { error: "required" });
export const unitsSchema = z.enum(UNITS, { error: "required" });

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz.length <= 64;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .refine(isValidTimezone, { error: "timezone_invalid" });

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "required" }).max(PASSWORD_MAX, { error: "too_long" }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], error: "password_mismatch" });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: "required" })
      .max(PASSWORD_MAX, { error: "too_long" }),
    newPassword: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], error: "password_mismatch" })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    error: "password_same",
  });

export const changeEmailSchema = z.object({ newEmail: emailSchema });

export const onboardingSchema = z.object({
  name: nameSchema,
  profession: professionSchema,
  timezone: timezoneSchema,
});

export const profileSchema = onboardingSchema;

/** One or more of a fixed set of keys, in the set's own order, without repeats. */
const pickMany = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values, { error: "invalid" }), { error: "required" })
    .min(1, { error: "required" })
    .transform((picked) => values.filter((v) => picked.includes(v)) as unknown as T[number][]);

/**
 * The six basketball onboarding answers (also edited in Settings → Coaching profile). "All of the above" replaces the
 * other needs, so the stored list is either just `all` or a specific set — never both.
 */
export const coachingProfileSchema = z.object({
  coachingExperience: z.enum(COACHING_EXPERIENCES, { error: "required" }),
  ageGroups: pickMany(COACH_AGE_GROUPS),
  typicalPlayers: z
    .int({ error: "number_invalid" })
    .min(COACH_LIMITS.minPlayers, { error: "range_invalid" })
    .max(COACH_LIMITS.maxPlayers, { error: "range_invalid" }),
  priorities: pickMany(COACH_PRIORITIES),
  needs: pickMany(COACH_NEEDS).transform((n) => (n.includes("all") ? (["all"] as typeof n) : n)),
  coachingStyles: pickMany(COACHING_STYLES),
});
export type CoachingProfileInput = z.output<typeof coachingProfileSchema>;

/** Finishing onboarding: the six answers, the coach's timezone (detected in the browser; an unknown zone falls back to UTC) and a name only when we have none. */
export const coachOnboardingSchema = z.object({
  coaching: coachingProfileSchema,
  timezone: z
    .string()
    .trim()
    .max(64)
    .transform((tz) => (isValidTimezone(tz) ? tz : "UTC")),
  name: z.string().trim().max(80, { error: "too_long" }).optional(),
});

export const skipOnboardingSchema = z.object({
  timezone: coachOnboardingSchema.shape.timezone,
  name: z.string().trim().max(80, { error: "too_long" }).optional(),
});

export const preferencesSchema = z.object({ units: unitsSchema });

export const workspaceSchema = z.object({
  workspaceName: z.string().trim().min(1, { error: "required" }).max(80, { error: "too_long" }),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, { error: "required" }).max(PASSWORD_MAX, { error: "too_long" }),
  confirm: z.literal("DELETE", { error: "delete_confirm" }),
});

/** Flatten a ZodError into `{ field: [messageKey, ...] }`. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
