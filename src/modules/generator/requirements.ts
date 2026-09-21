import { z } from "zod";
import { INTENSITIES, LEVELS, PLAN_LIMITS } from "@/db/enums";
import { SESSION_TYPES } from "./types";

/**
 * What a coach asks for, as structured data (Step 8). The same schema is filled by the generator form, by the rule-based
 * request reader and by the AI assistant — so there is exactly one definition of "a request", and the model is never
 * trusted: whatever it proposes goes through this schema like anything a browser sends.
 *
 * Equipment is a map from an equipment key (basketball, hoop, cones, bibs, markers, stopwatch) to how many the coach has.
 * A key that is not listed means "not a limit" (nobody is asked to count every cone); `baskets` is the hoops available.
 */

const key = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, { error: "invalid" });
const int = (min: number, max: number) =>
  z
    .int({ error: "number_invalid" })
    .min(min, { error: "range_invalid" })
    .max(max, { error: "range_invalid" });

export const requirementsSchema = z.strictObject({
  /** Session title; "" = the generator names it. */
  title: z.string().trim().max(120, { error: "too_long" }).default(""),
  teamName: z.string().trim().max(80, { error: "too_long" }).default(""),
  /** Age group key (u12…) and/or the players' real ages. */
  ageGroup: z.union([z.literal(""), key]).default(""),
  ageMin: int(3, 99).nullable().default(null),
  ageMax: int(3, 99).nullable().default(null),
  level: z.union([z.literal(""), z.enum(LEVELS)]).default(""),
  players: int(1, 60),
  /** Total minutes, breaks included. */
  durationMin: int(PLAN_LIMITS.minTargetMinutes, PLAN_LIMITS.maxTargetMinutes),
  primaryObjective: z.union([z.literal(""), key]).default(""),
  secondaryObjectives: z.array(key).max(PLAN_LIMITS.maxSecondaryObjectives).default([]),
  /** Baskets (hoops) available at the same time. null = not a limit. */
  baskets: int(1, 30).nullable().default(null),
  /** Everything else, by equipment key. */
  equipment: z.record(key, int(0, 500)).default({}),
  /** Space: any, only half a court, or a full court is there. */
  space: z.enum(["any", "half", "full"]).default("any"),
  /** Overall intensity the coach wants; "" = balanced. */
  intensity: z.union([z.literal(""), z.enum(INTENSITIES)]).default(""),
  sessionType: z.enum(SESSION_TYPES).default("practice"),
  /** Preferred formats (1v1, 3v3, group…): a nudge, not a rule. */
  formats: z
    .array(z.string().regex(/^[a-z0-9_]{1,16}$/))
    .max(6)
    .default([]),
  /** Drills that must be in the session, and drills that must not. Ids of real drills only (checked against the candidates). */
  mustInclude: z.array(z.uuid()).max(6).default([]),
  exclude: z.array(z.uuid()).max(30).default([]),
  /** Another deterministic take on the same request (0 = the best; each number is a different, reproducible variation). */
  variant: int(0, 50).default(0),
});

export type Requirements = z.output<typeof requirementsSchema>;
export type RequirementsInput = z.input<typeof requirementsSchema>;

/** The hoops available: the explicit basket count, else what the equipment map says about `hoop`. */
export const basketsOf = (r: Pick<Requirements, "baskets" | "equipment">): number | null =>
  r.baskets ?? (r.equipment.hoop !== undefined ? r.equipment.hoop : null);

/** How many of an equipment key the coach has, or null when it is not a limit. */
export function availableOf(
  r: Pick<Requirements, "baskets" | "equipment">,
  equipmentKey: string,
): number | null {
  if (equipmentKey === "hoop") return basketsOf(r);
  const n = r.equipment[equipmentKey];
  return n === undefined ? null : n;
}
