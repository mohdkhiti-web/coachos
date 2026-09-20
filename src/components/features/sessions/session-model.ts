import type { PlanDetailDto } from "@/modules/plans/dto";
import { planInputSchema } from "@/modules/plans/validators";

/**
 * The session form's model: what the coach types (all strings, like the inputs that hold them), and the two
 * conversions around it — to the payload the Server Action validates, and back from a stored session. Pure and
 * client-safe. Validation here is for SPEED: it uses the very same schema the server enforces (`planInputSchema`),
 * and the server checks everything again — the browser is never trusted.
 */

export type FieldErrors = Record<string, string[]>;

export interface SessionFormValues {
  title: string;
  teamName: string;
  /** Age group key ("" = none). */
  ageGroup: string;
  level: string;
  /** Number of players, as typed. */
  players: string;
  /** The coach's target length in minutes, as typed. */
  targetMinutes: string;
  scheduledDate: string;
  startTime: string;
  timezone: string;
  /** Objective keys: one main, a few secondary. */
  primaryObjective: string;
  secondaryObjectives: string[];
  /** One-sentence goal (optional). */
  objective: string;
  location: string;
  season: string;
  sessionNumber: string;
  coachName: string;
  clubName: string;
  coachNotes: string;
  visibility: "private" | "organization";
}

export function emptySessionValues(defaults: {
  timezone: string;
  coachName: string;
  clubName: string;
  targetMinutes: number;
}): SessionFormValues {
  return {
    title: "",
    teamName: "",
    ageGroup: "",
    level: "",
    players: "",
    targetMinutes: String(defaults.targetMinutes),
    scheduledDate: "",
    startTime: "",
    timezone: defaults.timezone,
    primaryObjective: "",
    secondaryObjectives: [],
    objective: "",
    location: "",
    season: "",
    sessionNumber: "",
    coachName: defaults.coachName,
    clubName: defaults.clubName,
    coachNotes: "",
    visibility: "private",
  };
}

/** A stored session as form values. `HH:MM:SS` from the database becomes `HH:MM`, which is what a time input holds. */
export function valuesFromPlan(plan: PlanDetailDto): SessionFormValues {
  return {
    title: plan.title,
    teamName: plan.teamName ?? "",
    ageGroup: plan.ageGroup?.key ?? "",
    level: plan.level ?? "",
    players: plan.players === null ? "" : String(plan.players),
    targetMinutes: String(plan.totals.targetMinutes),
    scheduledDate: plan.scheduledDate ?? "",
    startTime: plan.startTime ? plan.startTime.slice(0, 5) : "",
    timezone: plan.timezone ?? "",
    primaryObjective: plan.objectives.primary?.key ?? "",
    secondaryObjectives: plan.objectives.secondary.map((o) => o.key),
    objective: plan.objective,
    location: plan.details.location,
    season: plan.details.season,
    sessionNumber: plan.details.sessionNumber === null ? "" : String(plan.details.sessionNumber),
    coachName: plan.details.coachName,
    clubName: plan.details.clubName,
    coachNotes: plan.details.coachNotes,
    visibility: plan.visibility,
  };
}

/** "" → null, "14" → 14. Anything that is not a number is passed through as text so the schema rejects it (never coerced silently). */
const num = (s: string): number | string | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
};

/** The payload for the Server Action — the input of `planInputSchema` (it does the trimming and defaults). */
export function toPayload(v: SessionFormValues, version?: number): Record<string, unknown> {
  const target = num(v.targetMinutes);
  return {
    title: v.title,
    teamName: v.teamName,
    ageGroup: v.ageGroup,
    level: v.level,
    players: num(v.players),
    ...(target === null ? {} : { targetMinutes: target }),
    objective: v.objective,
    scheduledDate: v.scheduledDate,
    startTime: v.startTime,
    timezone: v.timezone,
    visibility: v.visibility,
    primaryObjective: v.primaryObjective,
    secondaryObjectives: v.secondaryObjectives,
    details: {
      location: v.location,
      season: v.season,
      sessionNumber: num(v.sessionNumber),
      coachName: v.coachName,
      clubName: v.clubName,
      coachNotes: v.coachNotes,
    },
    ...(version === undefined ? {} : { version }),
  };
}

/** Field errors keyed by form field (details.* are flattened to the field's own name), as message keys under `validation.*`. */
export function validateSession(
  v: SessionFormValues,
  opts: { requirePrimary?: boolean } = {},
): FieldErrors {
  const errors: FieldErrors = {};
  const add = (path: string, key: string) => {
    const list = (errors[path] ??= []);
    if (!list.includes(key)) list.push(key);
  };
  const parsed = planInputSchema.safeParse(toPayload(v));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path[0] === "details" ? String(issue.path[1]) : String(issue.path[0]);
      add(path, issue.message);
    }
  }
  if (opts.requirePrimary && !v.primaryObjective) add("primaryObjective", "required");
  return errors;
}

export const errorsFor = (errors: FieldErrors | undefined, path: string): string[] =>
  errors?.[path] ?? [];

/** Server field errors use the payload's paths (`details.location`); map them onto the form's field names. */
export function fieldsFromServer(fields: FieldErrors | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const [path, keys] of Object.entries(fields ?? {})) {
    const name = path.startsWith("details.") ? path.slice("details.".length) : path.split(".")[0]!;
    out[name] = [...(out[name] ?? []), ...keys];
  }
  return out;
}

/** A stable string for "have the values changed?" — key order is fixed by `toPayload`. */
export const valuesKey = (v: SessionFormValues): string => JSON.stringify(toPayload(v));
