import type { Intensity } from "@/db/enums";
import { requirementsSchema } from "@/modules/generator/requirements";
import { SESSION_TYPES, type SessionType } from "@/modules/generator/types";
import type { GeneratedItem } from "@/modules/generator/types";
import type { SessionFormValues } from "../sessions/session-model";

/**
 * The generator form's model (Step 8): what the coach types on top of the session basics, and the conversions to the
 * request the Server Action validates. Pure and client-safe. The browser checks for speed with the server's own schema;
 * the server checks everything again.
 */

export interface GeneratorOptions {
  /** Hoops available, as typed ("" = not a limit). */
  baskets: string;
  basketball: string;
  cones: string;
  bibs: string;
  space: "any" | "half" | "full";
  intensity: "" | Intensity;
  sessionType: SessionType;
}

export const emptyOptions = (): GeneratorOptions => ({
  baskets: "",
  basketball: "",
  cones: "",
  bibs: "",
  space: "any",
  intensity: "",
  sessionType: "practice",
});

export { SESSION_TYPES };

const num = (v: string): number | null => {
  const n = v.trim() === "" ? NaN : Number(v);
  return Number.isInteger(n) ? n : null;
};

/** The request the generator understands: the session basics plus the limits the coach gave. */
export function toRequirements(
  v: SessionFormValues,
  o: GeneratorOptions,
  extra: { variant?: number; mustInclude?: string[]; exclude?: string[] } = {},
): Record<string, unknown> {
  const equipment: Record<string, number> = {};
  for (const key of ["basketball", "cones", "bibs"] as const) {
    const n = num(o[key]);
    if (n !== null) equipment[key] = n;
  }
  return {
    title: v.title,
    teamName: v.teamName,
    ageGroup: v.ageGroup,
    level: v.level,
    players: num(v.players) ?? 0,
    durationMin: num(v.targetMinutes) ?? 0,
    primaryObjective: v.primaryObjective,
    secondaryObjectives: v.secondaryObjectives,
    baskets: num(o.baskets),
    equipment,
    space: o.space,
    intensity: o.intensity,
    sessionType: o.sessionType,
    variant: extra.variant ?? 0,
    mustInclude: extra.mustInclude ?? [],
    exclude: extra.exclude ?? [],
  };
}

/** The parts of a session the generator does not decide: when, where, who sees it, the coach's notes. */
export function toExtras(v: SessionFormValues): Record<string, unknown> {
  return {
    objective: v.objective,
    scheduledDate: v.scheduledDate,
    startTime: v.startTime,
    timezone: v.timezone,
    visibility: v.visibility,
    details: {
      location: v.location,
      season: v.season,
      sessionNumber: num(v.sessionNumber),
      coachName: v.coachName,
      clubName: v.clubName,
      coachNotes: v.coachNotes,
    },
  };
}

/** Field errors of the form, from the request schema, keyed like the session form's own fields. */
export function validateRequest(
  v: SessionFormValues,
  o: GeneratorOptions,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const add = (path: string, key: string) => {
    const list = (errors[path] ??= []);
    if (!list.includes(key)) list.push(key);
  };
  const map: Record<string, string> = { durationMin: "targetMinutes" };
  const parsed = requirementsSchema.safeParse(toRequirements(v, o));
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      add(map[field] ?? field, issue.message);
    }
  if (!v.primaryObjective) add("primaryObjective", "required");
  if (!v.players.trim()) add("players", "required");
  return errors;
}

/** What a drill costs the coach in preview: the item as the server built it, plus what the coach did to it. */
export type PreviewItem = GeneratedItem;

/** The items as the Server Action expects them: a drill by id, a break by minutes. */
export const itemsPayload = (items: readonly GeneratedItem[]) =>
  items.map((i) => ({
    kind: i.kind,
    drillId: i.drillId,
    phase: i.phase,
    durationMin: i.durationMin,
    locked: i.locked,
  }));
