import "server-only";
import { DRILL_PHASES } from "@/db/enums";
import { can, type Actor } from "@/lib/authz/can";
import { fail, ok, type FieldErrors, type Result } from "@/lib/result";
import { createPlan, planInputSchema, type SeedActivity } from "@/modules/plans";
import { getAgeGroups, getObjectives, getSport } from "@/modules/sports";
import { z } from "zod";
import { alternativesFor, equipmentPeak, generateSession } from "./generate";
import type { GenerationLabels, GenerationPreview } from "./dto";
import { loadCandidates } from "./queries";
import { requirementsSchema, type Requirements } from "./requirements";
import type {
  DrillCandidate,
  GeneratedItem,
  ObjectiveRule,
  Reason,
  ValidationReport,
} from "./types";
import { validateSession } from "./validate";

/**
 * The write and preview side of the generator (Step 8). A generated session is NEVER a special kind of session:
 * `createGeneratedSession` validates what the coach is looking at against the real drills they can read, and then calls
 * the normal `createPlan` (rows, snapshots, audit, RLS — all the usual rules), after which the Session Builder opens it.
 */

/** Items as they cross from a browser or an assistant: a drill by id (never by name), a break by minutes. */
export const generatedItemSchema = z.strictObject({
  kind: z.enum(["drill", "break"]),
  drillId: z.uuid().nullable(),
  phase: z.enum(DRILL_PHASES).nullable(),
  durationMin: z.int().min(1).max(480),
  locked: z.boolean().default(false),
});
export type GeneratedItemInput = z.input<typeof generatedItemSchema>;

export const generatedItemsSchema = z.array(generatedItemSchema).min(1).max(40);

/** The fields of a session the generator does not decide (when, where, who sees it, which saved design). */
const EXTRAS = [
  "scheduledDate",
  "startTime",
  "timezone",
  "visibility",
  "objective",
  "details",
  "templateId",
];

const fieldErrors = (issues: Array<{ path: PropertyKey[]; message: string }>): FieldErrors => {
  const fields: FieldErrors = {};
  for (const i of issues) (fields[i.path.join(".") || "form"] ??= []).push(i.message);
  return fields;
};

interface Prepared {
  req: Requirements;
  candidates: DrillCandidate[];
  byId: Map<string, DrillCandidate>;
  rules: ObjectiveRule[];
  objectiveNames: Map<string, string>;
}

/** Authorize, read the sport's catalog and the drills the actor can see, and turn a raw request into a checked one. */
async function prepare(actor: Actor, sportKey: string, raw: unknown): Promise<Result<Prepared>> {
  if (!can(actor, "plan:create", { organizationId: actor.organizationId }))
    return fail("FORBIDDEN");
  const sport = await getSport(sportKey);
  if (!sport) return fail("NOT_FOUND");

  const parsed = requirementsSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", { fields: fieldErrors(parsed.error.issues) });
  let req = parsed.data;

  const [groups, objectives] = await Promise.all([getAgeGroups(sport.id), getObjectives(sport.id)]);
  const problems: FieldErrors = {};
  if (req.ageGroup) {
    const group = groups.find((g) => g.key === req.ageGroup);
    if (!group) problems.ageGroup = ["invalid"];
    else if (req.ageMin === null && req.ageMax === null)
      req = { ...req, ageMin: group.ageMin, ageMax: group.ageMax };
  }
  if ((req.ageMin === null) !== (req.ageMax === null))
    problems[req.ageMin === null ? "ageMin" : "ageMax"] = ["required"];
  else if (req.ageMin !== null && req.ageMax !== null && req.ageMin > req.ageMax)
    problems.ageMax = ["range_order"];
  if (!req.primaryObjective) problems.primaryObjective = ["required"];
  for (const [field, keys] of [
    ["primaryObjective", req.primaryObjective ? [req.primaryObjective] : []],
    ["secondaryObjectives", req.secondaryObjectives],
  ] as const)
    if (keys.some((k) => !objectives.some((o) => o.key === k))) problems[field] = ["invalid"];
  if (
    new Set([req.primaryObjective, ...req.secondaryObjectives]).size !==
    1 + req.secondaryObjectives.length
  )
    problems.secondaryObjectives = ["skill_duplicate"];
  if (Object.keys(problems).length > 0) return fail("VALIDATION", { fields: problems });

  const candidates = await loadCandidates(actor, sportKey);
  return ok({
    req,
    candidates,
    byId: new Map(candidates.map((d) => [d.id, d])),
    rules: objectives.map((o) => ({
      key: o.key,
      name: o.name,
      coveredSkillKeys: o.coveredSkillKeys,
      categoryKeys: o.categoryKeys,
    })),
    objectiveNames: new Map(objectives.map((o) => [o.key, o.name])),
  });
}

function previewOf(
  p: Prepared,
  items: GeneratedItem[],
  validation: ValidationReport,
  equipment: Record<string, number>,
  considered: GenerationPreview["considered"],
): GenerationPreview {
  const drills: Record<string, DrillCandidate> = {};
  for (const item of items) {
    for (const id of [item.drillId, ...item.alternatives.map((a) => a.drillId)]) {
      const d = id ? p.byId.get(id) : undefined;
      if (d) drills[d.id] = d;
    }
  }
  return { requirements: p.req, items, validation, equipment, considered, drills };
}

/** Build a session for a request. Nothing is written; the same request always gives the same answer. */
export async function previewGeneration(
  actor: Actor,
  sportKey: string,
  raw: unknown,
): Promise<Result<GenerationPreview>> {
  const prepared = await prepare(actor, sportKey, raw);
  if (!prepared.ok) return prepared;
  const p = prepared.data;
  const out = generateSession({ req: p.req, drills: p.candidates, objectives: p.rules });
  return ok(previewOf(p, out.items, out.validation, out.equipment, out.considered));
}

/**
 * Take the timeline a coach (or an assistant) has arranged — swapped drills, kept drills — and answer the same questions:
 * is every drill real and readable, is it sound, what are the alternatives now. A drill the coach picked by hand is
 * marked `locked`, so a regeneration keeps it.
 */
export async function reviseGeneration(
  actor: Actor,
  sportKey: string,
  raw: unknown,
  rawItems: unknown,
): Promise<Result<GenerationPreview>> {
  const prepared = await prepare(actor, sportKey, raw);
  if (!prepared.ok) return prepared;
  return reviseWith(prepared.data, rawItems);
}

function reviseWith(p: Prepared, rawItems: unknown): Result<GenerationPreview> {
  const parsed = generatedItemsSchema.safeParse(rawItems);
  if (!parsed.success) return fail("VALIDATION", { fields: fieldErrors(parsed.error.issues) });

  const items: GeneratedItem[] = [];
  for (const raw of parsed.data) {
    if (raw.kind === "break") {
      items.push({
        kind: "break",
        drillId: null,
        title: "",
        phase: null,
        durationMin: raw.durationMin,
        groups: 1,
        reasons: [],
        alternatives: [],
        locked: false,
      });
      continue;
    }
    const drill = raw.drillId ? p.byId.get(raw.drillId) : undefined;
    if (!drill) return fail("NOT_FOUND"); // not a drill this coach can read: nothing is invented, nothing leaks
    const reasons: Reason[] = raw.locked ? [{ code: "locked" }] : [];
    items.push({
      kind: "drill",
      drillId: drill.id,
      title: drill.title,
      phase: raw.phase ?? drill.phases[0] ?? "skill",
      durationMin: raw.durationMin,
      groups: Math.max(1, Math.ceil(p.req.players / Math.max(1, drill.playersMax))),
      reasons,
      alternatives: [],
      locked: raw.locked,
    });
  }
  const args = { req: p.req, drills: p.candidates, objectives: p.rules };
  items.forEach((item, index) => {
    item.alternatives = alternativesFor({ ...args, items, index });
  });
  const validation = validateSession({ items, req: p.req, drills: p.byId, objectives: p.rules });
  return ok(
    previewOf(p, items, validation, equipmentPeak(items, p.byId, p.req.players), {
      total: p.candidates.length,
      eligible: p.candidates.length,
    }),
  );
}

/**
 * Create the normal, editable session for a generated timeline. Refused (VALIDATION) when the timeline has errors —
 * the wrong total, too few players, not enough equipment — so nothing unsound is ever created silently. Returns the
 * warnings the coach should still look at.
 */
export async function createGeneratedSession(
  actor: Actor,
  sportKey: string,
  raw: unknown,
  rawItems: unknown,
  extras: Record<string, unknown>,
  labels: GenerationLabels,
): Promise<Result<{ id: string; version: number; warnings: number }>> {
  const prepared = await prepare(actor, sportKey, raw);
  if (!prepared.ok) return prepared;
  const revised = reviseWith(prepared.data, rawItems);
  if (!revised.ok) return revised;
  const { requirements: req, items, validation } = revised.data;
  if (!validation.ok)
    return fail("VALIDATION", {
      fields: {
        generator: [
          ...new Set(validation.issues.filter((i) => i.severity === "error").map((i) => i.code)),
        ],
      },
    });

  const name = prepared.data.objectiveNames.get(req.primaryObjective) ?? "";
  const plan = planInputSchema.safeParse({
    ...Object.fromEntries(Object.entries(extras).filter(([k]) => EXTRAS.includes(k))),
    title: req.title || labels.title(name, req.durationMin),
    teamName: req.teamName,
    ageGroup: req.ageGroup,
    ageMin: req.ageMin,
    ageMax: req.ageMax,
    level: req.level,
    players: req.players,
    targetMinutes: req.durationMin,
    primaryObjective: req.primaryObjective,
    secondaryObjectives: req.secondaryObjectives,
  });
  if (!plan.success) return fail("VALIDATION", { fields: fieldErrors(plan.error.issues) });

  const activities: SeedActivity[] = items.map((i) =>
    i.kind === "break"
      ? { kind: "break", title: labels.breakTitle, durationMin: i.durationMin }
      : { kind: "drill", drillId: i.drillId!, phase: i.phase, durationMin: i.durationMin },
  );
  const created = await createPlan(actor, sportKey, plan.data, activities, "generator");
  if (!created.ok) return created;
  return ok({
    id: created.data.id,
    version: created.data.version,
    warnings: validation.issues.filter((i) => i.severity === "warning").length,
  });
}
