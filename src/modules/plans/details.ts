import { z } from "zod";

/**
 * The free-form, coach-facing details of a session (stored as versioned JSON in `plans.details`,
 * ARCHITECTURE.md §4.4): where, when in the season, who runs it, for which club, and the coach's notes.
 * Nothing here is filtered on relationally — the things a coach filters by (team, age group, level, date…)
 * are real columns. Pure: shared by the commands, the future builder form and the document model.
 * Error messages are i18n keys under `validation.*`.
 *
 * Adding a field later = adding an optional field with a default (no migration); changing the meaning of an
 * existing one = bumping the version and adding a step to `migratePlanDetails`.
 */

export const PLAN_DETAILS_VERSION = 1 as const;

const text = (max: number) => z.string().trim().max(max, { error: "too_long" }).default("");

export const planDetailsSchema = z.strictObject({
  schemaVersion: z.literal(PLAN_DETAILS_VERSION).default(PLAN_DETAILS_VERSION),
  /** Location / court / gym. */
  location: text(120),
  season: text(40),
  /** "Session 12" of the season; null = not numbered. */
  sessionNumber: z
    .int({ error: "number_invalid" })
    .min(1, { error: "range_invalid" })
    .max(9999, { error: "range_invalid" })
    .nullable()
    .default(null),
  coachName: text(80),
  /** The club, school or academy the session is run for. */
  clubName: text(120),
  /** Private notes for the coach, printed on the overview if the coach chooses. Kept below the column's 16 KB cap even in 4-byte characters. */
  coachNotes: text(3000),
});

export type PlanDetails = z.output<typeof planDetailsSchema>;
export type PlanDetailsInput = z.input<typeof planDetailsSchema>;

export const emptyPlanDetails = (): PlanDetails => planDetailsSchema.parse({});

/**
 * Every read passes through this, so rows written by an older version keep working. Only v1 exists today.
 * Returns null for a version this code does not know (a row written by a NEWER deploy): the caller decides
 * how to degrade rather than showing half-understood data.
 */
export function migratePlanDetails(raw: unknown): PlanDetails | null {
  if (typeof raw !== "object" || raw === null) return null;
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version !== PLAN_DETAILS_VERSION) return null;
  const parsed = planDetailsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
