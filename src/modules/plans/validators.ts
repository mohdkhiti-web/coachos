import { z } from "zod";
import { DRILL_PHASES, LEVELS, PLAN_LIMITS, PLAN_STATUSES, PLAN_VISIBILITIES } from "@/db/enums";
import { documentDesignSchema, PRESET_IDS, reflectionSchema } from "@/modules/documents";
import { planDetailsSchema } from "./details";
import { customContentSchema } from "./custom-content";
import { isClockTime, isIsoDate, isValidTimeZone } from "./schedule";

/**
 * Input schemas for the session commands (the future Server Action payloads). Anything that depends on WHICH
 * sport this is — its age groups, its objectives — is checked against the catalog inside the command. Messages
 * are i18n keys (`validation.*`). Empty string = "not chosen"; numbers use `null` for the same.
 */

const key = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, {
  error: (issue) => (issue.input === "" ? "required" : "invalid"),
});
const int = (min: number, max: number) =>
  z
    .int({ error: "number_invalid" })
    .min(min, { error: "range_invalid" })
    .max(max, { error: "range_invalid" });

const optionalKey = z.union([z.literal(""), key]).default("");

// ---------------------------------------------------------------------------------------------------
// the session
// ---------------------------------------------------------------------------------------------------

export const planInputSchema = z
  .strictObject({
    title: z.string().trim().min(1, { error: "required" }).max(120, { error: "too_long" }),
    teamName: z.string().trim().max(80, { error: "too_long" }).default(""),
    /** An age group key of the sport (u12…); "" = none. */
    ageGroup: optionalKey,
    /** The players' actual ages. Both or neither; when only a group is chosen they default to the group's typical range. */
    ageMin: int(3, 99).nullable().default(null),
    ageMax: int(3, 99).nullable().default(null),
    level: z.union([z.literal(""), z.enum(LEVELS)]).default(""),
    players: int(1, 60).nullable().default(null),
    /** Omitted = the sport's default session length. */
    targetMinutes: int(PLAN_LIMITS.minTargetMinutes, PLAN_LIMITS.maxTargetMinutes).optional(),
    objective: z.string().trim().max(500, { error: "too_long" }).default(""),
    /** Local date `YYYY-MM-DD`, local start time `HH:MM`, IANA zone. "" = not scheduled. There is NO end time. */
    scheduledDate: z
      .union([z.literal(""), z.string().refine(isIsoDate, { error: "date_invalid" })])
      .default(""),
    startTime: z
      .union([z.literal(""), z.string().refine(isClockTime, { error: "time_invalid" })])
      .default(""),
    timezone: z
      .union([z.literal(""), z.string().refine(isValidTimeZone, { error: "timezone_invalid" })])
      .default(""),
    visibility: z.enum(PLAN_VISIBILITIES).default("private"),
    /** Objective keys of the sport (shooting, transition…): one primary, a few secondary. */
    primaryObjective: optionalKey,
    secondaryObjectives: z
      .array(key)
      .max(PLAN_LIMITS.maxSecondaryObjectives, { error: "too_many" })
      .default([]),
    details: planDetailsSchema.default(() => planDetailsSchema.parse({})),
    /** Present on updates: the version the editor loaded (optimistic concurrency). */
    version: z.int().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.ageMin === null) !== (v.ageMax === null))
      ctx.addIssue({
        code: "custom",
        path: [v.ageMin === null ? "ageMin" : "ageMax"],
        message: "required",
      });
    if (v.ageMin !== null && v.ageMax !== null && v.ageMin > v.ageMax)
      ctx.addIssue({ code: "custom", path: ["ageMax"], message: "range_order" });
    if (v.startTime && !v.scheduledDate)
      ctx.addIssue({ code: "custom", path: ["scheduledDate"], message: "required" });
    if (v.secondaryObjectives.includes(v.primaryObjective))
      ctx.addIssue({ code: "custom", path: ["secondaryObjectives"], message: "skill_duplicate" });
    if (new Set(v.secondaryObjectives).size !== v.secondaryObjectives.length)
      ctx.addIssue({ code: "custom", path: ["secondaryObjectives"], message: "skill_duplicate" });
    if (v.secondaryObjectives.length > 0 && !v.primaryObjective)
      ctx.addIssue({ code: "custom", path: ["primaryObjective"], message: "required" });
  });

export type PlanInput = z.output<typeof planInputSchema>;
export type PlanInputRaw = z.input<typeof planInputSchema>;

export const planStatusInputSchema = z.enum(PLAN_STATUSES);

// ---------------------------------------------------------------------------------------------------
// the timeline
// ---------------------------------------------------------------------------------------------------

const duration = int(1, PLAN_LIMITS.maxActivityMinutes);
const phase = z.enum(DRILL_PHASES, { error: "invalid" }).nullable().default(null);
const repetitions = int(1, 99).nullable().default(null);
const players = int(1, 60).nullable().default(null);
const notes = z.string().trim().max(2000, { error: "too_long" }).default("");
const title = z.string().trim().min(1, { error: "required" }).max(120, { error: "too_long" });
/** Where in the timeline to insert (0 = first). Omitted = at the end. */
const position = int(0, PLAN_LIMITS.maxActivities - 1).optional();
const version = z.int().min(1);

/** Add a copy of a drill the coach may read. The copy is made by the command, from the drill as it is right now. */
export const addDrillActivitySchema = z.strictObject({
  drillId: z.uuid(),
  /** Omitted = the middle of the drill's suggested range. */
  durationMin: duration.optional(),
  /** Omitted = the drill's first phase (null if it has none). */
  phase: z.enum(DRILL_PHASES, { error: "invalid" }).nullable().optional(),
  repetitions,
  players,
  notes,
  position,
  version,
});
export type AddDrillActivityInput = z.output<typeof addDrillActivitySchema>;

/** A coach-written block: "Team talk", "Film", a drill of their own that is not in the library. */
export const addCustomActivitySchema = z.strictObject({
  title,
  phase,
  durationMin: duration,
  repetitions,
  players,
  notes,
  /** What the coach wrote about it (description, steps, coaching points). */
  content: customContentSchema.default({
    description: "",
    instructions: [],
    coachingPoints: [],
  }),
  position,
  version,
});
export type AddCustomActivityInput = z.output<typeof addCustomActivitySchema>;

/** Water break, transition, team huddle. No content, no phase. */
export const addBreakSchema = z.strictObject({
  title: title.default("Break"),
  durationMin: duration,
  notes,
  position,
  version,
});
export type AddBreakInput = z.output<typeof addBreakSchema>;

/**
 * Change one activity. Every field is optional; what is present is changed. `content` is a PARTIAL edit of
 * the copied content (for a drill: any of setup, organization, instructions… ; for a custom activity:
 * description, instructions, coachingPoints) — the merged result is validated as a whole by the command, and
 * editing it marks the activity as customized.
 */
export const updateActivitySchema = z.strictObject({
  title: title.optional(),
  phase: z.enum(DRILL_PHASES, { error: "invalid" }).nullable().optional(),
  durationMin: duration.optional(),
  repetitions: int(1, 99).nullable().optional(),
  players: int(1, 60).nullable().optional(),
  notes: z.string().trim().max(2000, { error: "too_long" }).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  changeReason: z.string().trim().max(300, { error: "too_long" }).optional(),
  version,
});
export type UpdateActivityInput = z.output<typeof updateActivitySchema>;

/** The full order of the timeline, by activity id. Must be exactly the session's current activities. */
export const reorderActivitiesSchema = z.strictObject({
  orderedIds: z.array(z.uuid()).max(PLAN_LIMITS.maxActivities),
  version,
});
export type ReorderActivitiesInput = z.output<typeof reorderActivitiesSchema>;

// ---------------------------------------------------------------------------------------------------
// the printed document
// ---------------------------------------------------------------------------------------------------

/**
 * Save how the session prints: the whole resolved design (validated field by field), the preset it started
 * from, and the reflection text. The command stores only the difference from the preset.
 */
export const planDocumentSchema = z.strictObject({
  version: int(1, 1_000_000),
  preset: z.enum(PRESET_IDS),
  design: documentDesignSchema,
  reflection: reflectionSchema,
});

export type PlanDocumentInput = z.output<typeof planDocumentSchema>;
