import "server-only";
import { z } from "zod";
import { DRILL_PHASES, LEVELS, INTENSITIES } from "@/db/enums";
import {
  applyOps,
  diagramOpsSchema,
  diagramSchema,
  validateDiagram,
  type Diagram,
} from "@/engines/diagram";
import type { Actor } from "@/lib/authz/can";
import { newId } from "@/lib/ids";
import { getDrill, parseFilters, searchDrills } from "@/modules/drills";
import {
  generateSession,
  loadCandidates,
  rankDrills,
  requirementsSchema,
  validateSession,
  type DrillCandidate,
  type GeneratedItem,
  type ObjectiveRule,
  type Requirements,
} from "@/modules/generator";
import { getPlan, type PlanDetailDto } from "@/modules/plans";
import { getAgeGroups, getObjectives, getSport } from "@/modules/sports";
import { getCourtPack } from "@/sports/registry";
import { isDestructive, proposalSchema, type Proposal } from "./proposals";

/**
 * The assistant's TOOLS (Step 8): the only way it can look at CoachOS or ask for a change. Each tool has a strict input
 * schema, runs as the person asking (row-level security decides what it can see), and returns a small structured result.
 *
 *  • READ tools answer at once (search, look up a drill, read the session, check it).
 *  • WRITE tools never write: they check the request against the real session and drills and record a PROPOSAL for the coach
 *    to apply (`apply.ts` then goes through the normal commands). A model can therefore never change a session by itself,
 *    invent a library drill (every drill id is looked up), touch a locked activity, or slip anything but data into a diagram.
 */

export interface ToolContext {
  actor: Actor;
  sportKey: string;
  /** The session the conversation is about, if it was opened from one. */
  planId: string | null;
  /** What the person wrote in this turn (custom activities are only made when it asks for one). */
  userText: string;
  /** Collected while the turn runs. */
  proposals: Proposal[];
  sources: Map<string, string>;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; code: string; message: string };

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  kind: "read" | "write";
  schema: S;
  run: (ctx: ToolContext, input: z.output<S>) => Promise<ToolResult>;
}

const ok = (data: unknown): ToolResult => ({ ok: true, data });
const no = (code: string, message: string): ToolResult => ({ ok: false, code, message });

const uuid = z.uuid();
const key = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/);
const minutes = z.int().min(1).max(480);
const optionalPlan = uuid.optional();

// ---- helpers ------------------------------------------------------------------------------------------------------

async function loadPlan(ctx: ToolContext, planId?: string): Promise<PlanDetailDto | ToolResult> {
  const id = planId ?? ctx.planId;
  if (!id)
    return no("no_session", "No session is open. Ask the coach which session, or create one.");
  const plan = await getPlan(ctx.actor, ctx.sportKey, id);
  if (!plan)
    return no("not_found", "That session does not exist or is not available to this coach.");
  return plan;
}
const isResult = (v: PlanDetailDto | ToolResult): v is ToolResult => "ok" in v;

/** A session, small enough to think with: ids, titles, minutes, locks. Nothing the model does not need. */
export function sessionView(plan: PlanDetailDto) {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    players: plan.players,
    level: plan.level,
    age: { group: plan.ageGroup?.key ?? null, min: plan.ageMin, max: plan.ageMax },
    objectives: {
      primary: plan.objectives.primary?.key ?? null,
      secondary: plan.objectives.secondary.map((o) => o.key),
    },
    targetMinutes: plan.totals.targetMinutes,
    totalMinutes: plan.totals.totalMinutes,
    canEdit: plan.permissions.canEdit,
    activities: plan.activities.map((a) => ({
      id: a.id,
      position: a.position,
      kind: a.kind,
      title: a.title,
      phase: a.phase,
      minutes: a.durationMin,
      locked: a.locked,
      customized: a.customized,
      drillId: a.source.drillId,
      diagrams: a.snapshot && "diagrams" in a.snapshot ? a.snapshot.diagrams.length : 0,
    })),
  };
}

const cardOf = (d: DrillCandidate) => ({
  id: d.id,
  title: d.title,
  category: d.category,
  level: d.level,
  ages: `${d.ageMin}-${d.ageMax}`,
  players: `${d.playersMin}-${d.playersMax}`,
  minutes: `${d.durationMin}-${d.durationMax}`,
  intensity: d.intensity,
  format: d.format,
  phases: d.phases,
});

interface Catalog {
  candidates: DrillCandidate[];
  byId: Map<string, DrillCandidate>;
  rules: ObjectiveRule[];
  names: Map<string, string>;
}
async function catalog(ctx: ToolContext): Promise<Catalog | null> {
  const sport = await getSport(ctx.sportKey);
  if (!sport) return null;
  const [candidates, objectives] = await Promise.all([
    loadCandidates(ctx.actor, ctx.sportKey),
    getObjectives(sport.id),
  ]);
  return {
    candidates,
    byId: new Map(candidates.map((d) => [d.id, d])),
    rules: objectives.map((o) => ({
      key: o.key,
      name: o.name,
      coveredSkillKeys: o.coveredSkillKeys,
      categoryKeys: o.categoryKeys,
    })),
    names: new Map(objectives.map((o) => [o.key, o.name])),
  };
}

/** The request a session stands for, to check it against the drills (the planned minutes, not the target, are what is validated). */
export function requirementsFromPlan(plan: PlanDetailDto): {
  req: Requirements;
  assumedPlayers: boolean;
} {
  const assumed = plan.players === null;
  const req = requirementsSchema.parse({
    title: plan.title,
    ageGroup: plan.ageGroup?.key ?? "",
    ageMin: plan.ageMin,
    ageMax: plan.ageMax,
    level: plan.level ?? "",
    players: plan.players ?? 12,
    durationMin: Math.max(5, plan.totals.totalMinutes || plan.totals.targetMinutes),
    primaryObjective: plan.objectives.primary?.key ?? "",
    secondaryObjectives: plan.objectives.secondary.map((o) => o.key),
  });
  return { req, assumedPlayers: assumed };
}

function itemsOfPlan(plan: PlanDetailDto, byId: Map<string, DrillCandidate>): GeneratedItem[] {
  return plan.activities.map((a) => {
    const drill = a.kind === "drill" && a.source.drillId ? byId.get(a.source.drillId) : undefined;
    return {
      kind: drill ? "drill" : "break",
      drillId: drill ? drill.id : null,
      title: a.title,
      phase: a.phase,
      durationMin: a.durationMin,
      groups: 1,
      reasons: [],
      alternatives: [],
      locked: a.locked,
    };
  });
}

const lockedNo = (title: string) =>
  no(
    "locked",
    `“${title}” is locked by the coach. Do not change, replace, move or remove it; suggest something else.`,
  );

function addProposal(
  ctx: ToolContext,
  p: { kind: Proposal["kind"] } & Record<string, unknown>,
): ToolResult {
  const parsed = proposalSchema.safeParse({ ...p, id: newId(), status: "pending" });
  if (!parsed.success)
    return no("invalid", "That proposal is not valid: " + parsed.error.issues[0]?.message);
  if (ctx.proposals.length >= 12) return no("too_many", "Too many proposals in one answer.");
  ctx.proposals.push(parsed.data);
  return ok({
    proposed: true,
    kind: parsed.data.kind,
    needsConfirmation: isDestructive(parsed.data),
    note: "Recorded for the coach to apply. Nothing has changed yet. Tell the coach what you propose and why.",
  });
}

// ---- read tools ---------------------------------------------------------------------------------------------------

const searchDrillsTool: ToolDef = {
  name: "search_drills",
  kind: "read",
  description:
    "Search the CoachOS drill library (and the coach's own drills) by words and filters. Returns real drills with their ids. Use it before recommending any drill.",
  schema: z.strictObject({
    query: z.string().trim().max(80).optional(),
    category: key.optional(),
    skill: key.optional(),
    level: z.enum(LEVELS).optional(),
    age: z.int().min(3).max(99).optional(),
    players: z.int().min(1).max(60).optional(),
    intensity: z.enum(INTENSITIES).optional(),
    phase: z.enum(DRILL_PHASES).optional(),
    format: z
      .string()
      .regex(/^[a-z0-9_]{1,16}$/)
      .optional(),
    limit: z.int().min(1).max(10).default(6),
  }),
  async run(ctx, input) {
    const i = input as {
      query?: string;
      category?: string;
      skill?: string;
      level?: string;
      age?: number;
      players?: number;
      intensity?: string;
      phase?: string;
      format?: string;
      limit: number;
    };
    const filters = parseFilters({
      q: i.query,
      category: i.category,
      skill: i.skill,
      level: i.level,
      age: i.age?.toString(),
      players: i.players?.toString(),
      intensity: i.intensity,
      phase: i.phase,
      format: i.format,
    });
    const page = await searchDrills(ctx.actor, ctx.sportKey, filters, { pageSize: i.limit });
    if (!page) return no("not_found", "Unknown sport.");
    for (const d of page.items) ctx.sources.set(d.id, d.title);
    return ok({
      total: page.total,
      drills: page.items.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        category: d.category.key,
        level: d.level,
        ages: `${d.ageMin}-${d.ageMax}`,
        players: `${d.playersMin}-${d.playersMax}`,
        minutes: `${d.durationMin}-${d.durationMax}`,
        intensity: d.intensity,
        format: d.format,
      })),
    });
  },
};

const getDrillTool: ToolDef = {
  name: "get_drill",
  kind: "read",
  description:
    "Read one drill's real content: objective, setup, instructions, coaching points, mistakes, progressions and regressions. Use it to explain a drill; quote it, do not embellish it.",
  schema: z.strictObject({ drillId: uuid }),
  async run(ctx, input) {
    const drill = await getDrill(ctx.actor, ctx.sportKey, (input as { drillId: string }).drillId);
    if (!drill || drill.status !== "published")
      return no("not_found", "There is no such drill available to this coach. Do not invent one.");
    ctx.sources.set(drill.id, drill.title);
    const c = drill.content;
    return ok({
      id: drill.id,
      title: drill.title,
      description: drill.description,
      category: drill.category.key,
      level: drill.level,
      ages: `${drill.ageMin}-${drill.ageMax}`,
      players: `${drill.playersMin}-${drill.playersMax}`,
      minutes: `${drill.durationMin}-${drill.durationMax}`,
      intensity: drill.intensity,
      equipment: drill.equipment.map((e) => `${e.quantity} ${e.key} (${e.rule})`),
      objective: c.objective,
      setup: c.setup,
      instructions: c.instructions,
      coachingPoints: c.coachingPoints,
      commonMistakes: c.commonMistakes,
      safety: c.safety,
      progressions: c.progressions,
      regressions: c.regressions,
      variations: c.variations,
      note: "This is CoachOS content. Say so when you use it, and keep your own suggestions clearly separate.",
    });
  },
};

const findMatchingTool: ToolDef = {
  name: "find_matching_drills",
  kind: "read",
  description:
    "Find the drills that best fit a coach's situation (objective, players, age, level, equipment, space), ranked by CoachOS's own rules. Only drills that can really be run with the given players and equipment are returned.",
  schema: z.strictObject({
    objective: key,
    players: z.int().min(1).max(60),
    ageGroup: key.optional(),
    level: z.enum(LEVELS).optional(),
    baskets: z.int().min(1).max(30).optional(),
    space: z.enum(["any", "half", "full"]).default("any"),
    phase: z.enum(DRILL_PHASES).default("skill"),
    limit: z.int().min(1).max(10).default(6),
  }),
  async run(ctx, input) {
    const i = input as {
      objective: string;
      players: number;
      ageGroup?: string;
      level?: string;
      baskets?: number;
      space: "any" | "half" | "full";
      phase: (typeof DRILL_PHASES)[number];
      limit: number;
    };
    const sport = await getSport(ctx.sportKey);
    const cat = await catalog(ctx);
    if (!sport || !cat) return no("not_found", "Unknown sport.");
    if (!cat.names.has(i.objective))
      return no("unknown_objective", "Use get_objectives for the valid objective keys.");
    const groups = await getAgeGroups(sport.id);
    const group = groups.find((g) => g.key === i.ageGroup);
    const req = requirementsSchema.parse({
      players: i.players,
      durationMin: 60,
      ageGroup: group?.key ?? "",
      ageMin: group?.ageMin ?? null,
      ageMax: group?.ageMax ?? null,
      level: i.level ?? "",
      primaryObjective: i.objective,
      baskets: i.baskets ?? null,
      space: i.space,
    });
    const ranked = rankDrills({
      req,
      drills: cat.candidates,
      objectives: cat.rules,
      phase: i.phase,
      limit: i.limit,
    });
    for (const r of ranked) ctx.sources.set(r.drill.id, r.drill.title);
    return ok({
      considered: cat.candidates.length,
      drills: ranked.map((r) => ({ ...cardOf(r.drill), fitScore: r.score })),
    });
  },
};

const getObjectivesTool: ToolDef = {
  name: "get_objectives",
  kind: "read",
  description:
    "List the session objectives of this sport (their keys and names). Use these keys, never invented ones.",
  schema: z.strictObject({}),
  async run(ctx) {
    const sport = await getSport(ctx.sportKey);
    if (!sport) return no("not_found", "Unknown sport.");
    const list = await getObjectives(sport.id);
    return ok({ objectives: list.map((o) => ({ key: o.key, name: o.name })) });
  },
};

const getAgeGroupsTool: ToolDef = {
  name: "get_age_groups",
  kind: "read",
  description: "List the age groups of this sport (key, name, typical ages).",
  schema: z.strictObject({}),
  async run(ctx) {
    const sport = await getSport(ctx.sportKey);
    if (!sport) return no("not_found", "Unknown sport.");
    const list = await getAgeGroups(sport.id);
    return ok({
      ageGroups: list.map((g) => ({ key: g.key, name: g.name, ages: `${g.ageMin}-${g.ageMax}` })),
    });
  },
};

const getSessionTool: ToolDef = {
  name: "get_session",
  kind: "read",
  description:
    "Read the session the coach is working on: its details and every activity with its id, minutes and whether it is locked. Always read it before proposing a change to it.",
  schema: z.strictObject({ planId: optionalPlan }),
  async run(ctx, input) {
    const plan = await loadPlan(ctx, (input as { planId?: string }).planId);
    if (isResult(plan)) return plan;
    return ok(sessionView(plan));
  },
};

const validateSessionTool: ToolDef = {
  name: "validate_session",
  kind: "read",
  description:
    "Check the session against CoachOS's rules: total minutes, players, equipment, objectives, warm-up and cool-down, age and level fit. Returns errors and warnings.",
  schema: z.strictObject({ planId: optionalPlan }),
  async run(ctx, input) {
    const plan = await loadPlan(ctx, (input as { planId?: string }).planId);
    if (isResult(plan)) return plan;
    const cat = await catalog(ctx);
    if (!cat) return no("not_found", "Unknown sport.");
    const { req, assumedPlayers } = requirementsFromPlan(plan);
    const report = validateSession({
      items: itemsOfPlan(plan, cat.byId),
      req,
      drills: cat.byId,
      objectives: cat.rules,
    });
    return ok({
      ok: report.ok,
      assumedPlayers: assumedPlayers ? req.players : undefined,
      planned: plan.totals.totalMinutes,
      target: plan.totals.targetMinutes,
      issues: report.issues.map((i) => ({ code: i.code, severity: i.severity, ...i.values })),
    });
  },
};

const generateSessionTool: ToolDef = {
  name: "generate_session",
  kind: "read",
  description:
    "Run CoachOS's deterministic session generator for a request and look at the result (nothing is created). Use create_session to propose creating it.",
  schema: z.lazy(() => generationInput),
  async run(ctx, input) {
    const built = await buildGeneration(ctx, input as GenerationInput);
    if ("ok" in built) return built;
    return ok({
      valid: built.validation.ok,
      considered: built.considered,
      items: built.items.map((i) => ({
        kind: i.kind,
        drillId: i.drillId,
        title: i.title || "Break",
        phase: i.phase,
        minutes: i.durationMin,
      })),
      issues: built.validation.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        ...i.values,
      })),
    });
  },
};

// ---- session generation (generate_session, create_session) ---------------------------------------------------------

const generationInput = z.strictObject({
  objective: key,
  secondaryObjectives: z.array(key).max(4).default([]),
  players: z.int().min(1).max(60),
  durationMin: z.int().min(5).max(480),
  ageGroup: key.optional(),
  level: z.enum(LEVELS).optional(),
  baskets: z.int().min(1).max(30).optional(),
  equipment: z.record(key, z.int().min(0).max(500)).default({}),
  space: z.enum(["any", "half", "full"]).default("any"),
  intensity: z.enum(INTENSITIES).optional(),
  sessionType: z.enum(["practice", "skills", "game_prep", "conditioning"]).default("practice"),
  title: z.string().trim().max(120).optional(),
  mustInclude: z.array(uuid).max(6).default([]),
  exclude: z.array(uuid).max(30).default([]),
  variant: z.int().min(0).max(50).default(0),
});
type GenerationInput = z.output<typeof generationInput>;

async function buildGeneration(ctx: ToolContext, i: GenerationInput) {
  const sport = await getSport(ctx.sportKey);
  const cat = await catalog(ctx);
  if (!sport || !cat) return no("not_found", "Unknown sport.");
  const groups = await getAgeGroups(sport.id);
  const group = i.ageGroup ? groups.find((g) => g.key === i.ageGroup) : undefined;
  if (i.ageGroup && !group)
    return no("unknown_age_group", "Use get_age_groups for the valid age group keys.");
  for (const k of [i.objective, ...i.secondaryObjectives])
    if (!cat.names.has(k))
      return no("unknown_objective", `“${k}” is not an objective. Use get_objectives.`);
  const parsed = requirementsSchema.safeParse({
    title: i.title ?? "",
    ageGroup: group?.key ?? "",
    ageMin: group?.ageMin ?? null,
    ageMax: group?.ageMax ?? null,
    level: i.level ?? "",
    players: i.players,
    durationMin: i.durationMin,
    primaryObjective: i.objective,
    secondaryObjectives: i.secondaryObjectives.filter((k) => k !== i.objective),
    baskets: i.baskets ?? null,
    equipment: i.equipment,
    space: i.space,
    intensity: i.intensity ?? "",
    sessionType: i.sessionType,
    mustInclude: i.mustInclude.filter((id) => cat.byId.has(id)),
    exclude: i.exclude,
    variant: i.variant,
  });
  if (!parsed.success)
    return no("invalid", "That request is not valid: " + parsed.error.issues[0]?.message);
  const out = generateSession({ req: parsed.data, drills: cat.candidates, objectives: cat.rules });
  for (const item of out.items) if (item.drillId) ctx.sources.set(item.drillId, item.title);
  return { ...out, req: parsed.data };
}

const createSessionTool: ToolDef<typeof generationInput> = {
  name: "create_session",
  kind: "write",
  description:
    "Propose creating a NEW session for a request. CoachOS builds it from real library drills with its deterministic generator (you do not choose the drills, except by mustInclude / exclude with ids you looked up). The coach reviews and creates it, then it opens in the Session Builder.",
  schema: generationInput,
  async run(ctx, input) {
    const built = await buildGeneration(ctx, input);
    if ("ok" in built) return built;
    if (built.items.every((i) => i.kind !== "drill"))
      return no(
        "no_drills",
        "No library drill fits this request. Tell the coach what is missing (players, equipment, age).",
      );
    const result = addProposal(ctx, {
      kind: "create_session",
      requirements: built.req,
      extras: {},
      items: built.items.map((i) => ({
        kind: i.kind,
        drillId: i.drillId,
        title: i.title,
        phase: i.phase,
        durationMin: i.durationMin,
        locked: i.locked,
      })),
      issues: built.validation.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        values: i.values,
        at: i.at,
      })),
    });
    if (!result.ok) return result;
    return ok({
      ...(result.data as object),
      valid: built.validation.ok,
      items: built.items.map((i) => ({
        title: i.title || "Break",
        phase: i.phase,
        minutes: i.durationMin,
      })),
      issues: built.validation.issues.map((i) => ({ code: i.code, severity: i.severity })),
    });
  },
};

// ---- session changes (write tools: proposals only) ------------------------------------------------------------------

const activityOf = (plan: PlanDetailDto, activityId: string) =>
  plan.activities.find((a) => a.id === activityId);

const addActivityTool: ToolDef = {
  name: "add_activity",
  kind: "write",
  description: "Propose adding a real library drill (by the id you found) to the session.",
  schema: z.strictObject({
    planId: optionalPlan,
    drillId: uuid,
    position: z.int().min(0).max(60).optional(),
    phase: z.enum(DRILL_PHASES).optional(),
    durationMin: minutes.optional(),
  }),
  async run(ctx, input) {
    const i = input as {
      planId?: string;
      drillId: string;
      position?: number;
      phase?: (typeof DRILL_PHASES)[number];
      durationMin?: number;
    };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const drill = await getDrill(ctx.actor, ctx.sportKey, i.drillId);
    if (!drill || drill.status !== "published")
      return no(
        "not_found",
        "There is no such drill. Search for it with search_drills; never invent a drill or an id.",
      );
    ctx.sources.set(drill.id, drill.title);
    return addProposal(ctx, {
      kind: "add_drill",
      planId: plan.id,
      drillId: drill.id,
      title: drill.title,
      phase: i.phase ?? drill.phases[0] ?? null,
      durationMin: i.durationMin ?? Math.round((drill.durationMin + drill.durationMax) / 2),
      position: i.position ?? null,
    });
  },
};

const replaceActivityTool: ToolDef = {
  name: "replace_activity",
  kind: "write",
  description:
    "Propose replacing one activity's drill with another real drill. Refused for a locked activity.",
  schema: z.strictObject({ planId: optionalPlan, activityId: uuid, drillId: uuid }),
  async run(ctx, input) {
    const i = input as { planId?: string; activityId: string; drillId: string };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const activity = activityOf(plan, i.activityId);
    if (!activity)
      return no("not_found", "That activity is not in the session. Use get_session for the ids.");
    if (activity.locked) return lockedNo(activity.title);
    if (activity.kind !== "drill")
      return no("not_a_drill", "Only a drill activity can be replaced by a drill.");
    const drill = await getDrill(ctx.actor, ctx.sportKey, i.drillId);
    if (!drill || drill.status !== "published")
      return no("not_found", "There is no such drill. Never invent one.");
    ctx.sources.set(drill.id, drill.title);
    return addProposal(ctx, {
      kind: "replace_drill",
      planId: plan.id,
      activityId: activity.id,
      activityTitle: activity.title,
      drillId: drill.id,
      title: drill.title,
    });
  },
};

const removeActivityTool: ToolDef = {
  name: "remove_activity",
  kind: "write",
  description:
    "Propose removing an activity from the session. Refused for a locked activity. The coach must confirm.",
  schema: z.strictObject({ planId: optionalPlan, activityId: uuid }),
  async run(ctx, input) {
    const i = input as { planId?: string; activityId: string };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const activity = activityOf(plan, i.activityId);
    if (!activity) return no("not_found", "That activity is not in the session.");
    if (activity.locked) return lockedNo(activity.title);
    return addProposal(ctx, {
      kind: "remove_activity",
      planId: plan.id,
      activityId: activity.id,
      title: activity.title,
    });
  },
};

const updateActivityTool: ToolDef = {
  name: "update_activity",
  kind: "write",
  description:
    "Propose changing one activity's title, phase, minutes, players, repetitions or notes. Refused for a locked activity.",
  schema: z.strictObject({
    planId: optionalPlan,
    activityId: uuid,
    title: z.string().trim().min(1).max(120).optional(),
    phase: z.enum(DRILL_PHASES).nullable().optional(),
    durationMin: minutes.optional(),
    players: z.int().min(1).max(60).nullable().optional(),
    repetitions: z.int().min(1).max(99).nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  async run(ctx, input) {
    const { planId, activityId, ...patch } = input as {
      planId?: string;
      activityId: string;
    } & Record<string, unknown>;
    const plan = await loadPlan(ctx, planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const activity = activityOf(plan, activityId);
    if (!activity) return no("not_found", "That activity is not in the session.");
    if (activity.locked) return lockedNo(activity.title);
    if (Object.keys(patch).length === 0) return no("nothing", "Nothing to change.");
    return addProposal(ctx, {
      kind: "update_activity",
      planId: plan.id,
      activityId: activity.id,
      title: activity.title,
      patch,
    });
  },
};

const reorderActivityTool: ToolDef = {
  name: "reorder_activity",
  kind: "write",
  description:
    "Propose moving an activity to another position (0 = first). Refused for a locked activity.",
  schema: z.strictObject({
    planId: optionalPlan,
    activityId: uuid,
    toPosition: z.int().min(0).max(60),
  }),
  async run(ctx, input) {
    const i = input as { planId?: string; activityId: string; toPosition: number };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const activity = activityOf(plan, i.activityId);
    if (!activity) return no("not_found", "That activity is not in the session.");
    if (activity.locked) return lockedNo(activity.title);
    if (i.toPosition >= plan.activities.length)
      return no("out_of_range", `Positions run from 0 to ${plan.activities.length - 1}.`);
    if (i.toPosition === activity.position) return no("nothing", "It is already there.");
    return addProposal(ctx, {
      kind: "reorder_activity",
      planId: plan.id,
      activityId: activity.id,
      title: activity.title,
      toPosition: i.toPosition,
    });
  },
};

/** Share `total` minutes across `weights`, whole minutes, exact, each at least 1. */
export function shareMinutes(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((n, w) => n + w, 0) || 1;
  const out = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  let diff = total - out.reduce((n, m) => n + m, 0);
  for (let i = 0; diff !== 0 && i < 10_000; i++) {
    const at = i % out.length;
    if (diff > 0) {
      out[at] = out[at]! + 1;
      diff--;
    } else if (out[at]! > 1) {
      out[at] = out[at]! - 1;
      diff++;
    }
  }
  return out;
}

const changeDurationTool: ToolDef = {
  name: "change_duration",
  kind: "write",
  description:
    "Propose changing the session's total length. The drill minutes are scaled to fit; breaks and locked activities keep their minutes. The coach reviews every change and must confirm.",
  schema: z.strictObject({ planId: optionalPlan, totalMinutes: z.int().min(5).max(480) }),
  async run(ctx, input) {
    const i = input as { planId?: string; totalMinutes: number };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const fixed = plan.activities.filter((a) => a.locked || a.kind === "break");
    const flexible = plan.activities.filter((a) => !a.locked && a.kind !== "break");
    if (flexible.length === 0)
      return no(
        "nothing_to_change",
        "Every activity is locked or a break, so there is nothing to scale.",
      );
    const fixedMinutes = fixed.reduce((n, a) => n + a.durationMin, 0);
    const room = i.totalMinutes - fixedMinutes;
    if (room < flexible.length)
      return no("too_short", "That is too short once locked activities and breaks are kept.");
    const next = shareMinutes(
      room,
      flexible.map((a) => a.durationMin),
    );
    const changes = flexible
      .map((a, at) => ({ activityId: a.id, title: a.title, from: a.durationMin, to: next[at]! }))
      .filter((c) => c.from !== c.to);
    if (changes.length === 0) return no("nothing", "The session is already that long.");
    return addProposal(ctx, { kind: "set_durations", planId: plan.id, changes });
  },
};

const changePlayerCountTool: ToolDef = {
  name: "change_player_count",
  kind: "write",
  description:
    "Propose changing the number of players the session is planned for, and report what that means for its drills.",
  schema: z.strictObject({ planId: optionalPlan, players: z.int().min(1).max(60) }),
  async run(ctx, input) {
    const i = input as { planId?: string; players: number };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const cat = await catalog(ctx);
    if (!cat) return no("not_found", "Unknown sport.");
    const { req } = requirementsFromPlan(plan);
    const report = validateSession({
      items: itemsOfPlan(plan, cat.byId),
      req: { ...req, players: i.players },
      drills: cat.byId,
      objectives: cat.rules,
    });
    const issues = report.issues.filter(
      (x) => x.code === "players_below_min" || x.code === "equipment_short",
    );
    const proposed = addProposal(ctx, {
      kind: "update_plan",
      planId: plan.id,
      players: i.players,
      issues: issues.map((x) => ({
        code: x.code,
        severity: x.severity,
        values: x.values,
        at: x.at,
      })),
    });
    if (!proposed.ok) return proposed;
    return ok({
      ...(proposed.data as object),
      problems: issues.map((x) => ({ code: x.code, ...x.values })),
    });
  },
};

const changeObjectivesTool: ToolDef = {
  name: "change_objectives",
  kind: "write",
  description:
    "Propose changing the session's main and secondary objectives (use the keys from get_objectives).",
  schema: z.strictObject({
    planId: optionalPlan,
    primary: key,
    secondary: z.array(key).max(4).default([]),
  }),
  async run(ctx, input) {
    const i = input as { planId?: string; primary: string; secondary: string[] };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const cat = await catalog(ctx);
    if (!cat) return no("not_found", "Unknown sport.");
    const wanted = [i.primary, ...i.secondary];
    if (new Set(wanted).size !== wanted.length)
      return no("duplicate", "An objective can be listed once.");
    for (const k of wanted)
      if (!cat.names.has(k))
        return no("unknown_objective", `“${k}” is not an objective. Use get_objectives.`);
    return addProposal(ctx, {
      kind: "update_plan",
      planId: plan.id,
      primaryObjective: i.primary,
      secondaryObjectives: i.secondary,
      issues: [],
    });
  },
};

const wantsCustom = (text: string) =>
  /\b(custom|own drill|new drill|make up|invent|create (a|an|one)|design (a|an|one)|write (a|an|one)|come up with)\b/i.test(
    text,
  );

const createCustomTool: ToolDef = {
  name: "create_custom_activity",
  kind: "write",
  description:
    "Propose a CUSTOM activity written by you. Only when the coach explicitly asks for something that is not in the library; otherwise use library drills. It is labelled as AI-generated and the coach must review it.",
  schema: z.strictObject({
    planId: optionalPlan,
    title: z.string().trim().min(1).max(120),
    durationMin: minutes,
    phase: z.enum(DRILL_PHASES).nullable().default(null),
    description: z.string().trim().max(2000),
    instructions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    coachingPoints: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    position: z.int().min(0).max(60).optional(),
  }),
  async run(ctx, input) {
    const i = input as {
      planId?: string;
      title: string;
      durationMin: number;
      phase: (typeof DRILL_PHASES)[number] | null;
      description: string;
      instructions: string[];
      coachingPoints: string[];
      position?: number;
    };
    if (!wantsCustom(ctx.userText))
      return no(
        "not_requested",
        "The coach did not ask for a custom activity. Use search_drills and propose a real drill instead.",
      );
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    return addProposal(ctx, {
      kind: "add_custom",
      planId: plan.id,
      title: i.title,
      phase: i.phase,
      durationMin: i.durationMin,
      description: i.description,
      instructions: i.instructions,
      coachingPoints: i.coachingPoints,
      position: i.position ?? null,
    });
  },
};

const addBreakTool: ToolDef = {
  name: "add_break",
  kind: "write",
  description: "Propose adding a break (water, transition, huddle) to the session.",
  schema: z.strictObject({
    planId: optionalPlan,
    durationMin: minutes,
    title: z.string().trim().min(1).max(120).default("Break"),
    position: z.int().min(0).max(60).optional(),
  }),
  async run(ctx, input) {
    const i = input as { planId?: string; durationMin: number; title: string; position?: number };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    return addProposal(ctx, {
      kind: "add_break",
      planId: plan.id,
      title: i.title,
      durationMin: i.durationMin,
      position: i.position ?? null,
    });
  },
};

// ---- diagrams ---------------------------------------------------------------------------------------------------------

const diagramsOf = (a: PlanDetailDto["activities"][number]) =>
  a.snapshot && "diagrams" in a.snapshot ? a.snapshot.diagrams : [];

const createDiagramTool: ToolDef = {
  name: "create_diagram",
  kind: "write",
  description:
    "Propose a diagram for an activity, as STRUCTURED DATA (never SVG or HTML): court {type:'half'|'full',variant:'fiba'}, entities (player with side offense|defense and a label, coach, ball held by a player or placed, cone), actions (pass from/to, cut/move/dribble with a path, screen, shot) and text notes. Positions are named court spots ({anchor:'top_key'}, with optional offset in metres) or metres ({x,y}). Names: basket, under_basket, free_throw_line, top_key, left_elbow, right_elbow, left_block, right_block, left_wing, right_wing, left_slot, right_slot, left_corner, right_corner, left_short_corner, right_short_corner, half_court_center; full court adds far_* versions. Only players and coaches move or pass; a pass, dribble or shot needs the ball.",
  schema: z.strictObject({
    planId: optionalPlan,
    activityId: uuid,
    title: z.string().trim().max(60).default(""),
    diagram: diagramSchema,
    index: z.int().min(0).max(4).default(0),
  }),
  async run(ctx, input) {
    const i = input as {
      planId?: string;
      activityId: string;
      title: string;
      diagram: Diagram;
      index: number;
    };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const activity = activityOf(plan, i.activityId);
    if (!activity) return no("not_found", "That activity is not in the session.");
    if (activity.locked) return lockedNo(activity.title);
    if (activity.kind === "break") return no("not_allowed", "A break has no diagram.");
    const pack =
      i.diagram.sport === ctx.sportKey ? getCourtPack(i.diagram.sport, i.diagram.court) : undefined;
    if (!pack) return no("invalid_diagram", "That court does not exist for this sport.");
    const issues = validateDiagram(i.diagram, pack);
    if (issues.length > 0)
      return no(
        "invalid_diagram",
        "The diagram is not valid: " +
          issues
            .slice(0, 4)
            .map((x) => `${x.code} at ${x.path}`)
            .join("; ") +
          ". Fix these and try again.",
      );
    const existing = diagramsOf(activity);
    return addProposal(ctx, {
      kind: "set_diagram",
      planId: plan.id,
      activityId: activity.id,
      title: activity.title,
      diagramTitle: i.title,
      diagram: i.diagram,
      replacing: i.index < existing.length,
      index: Math.min(i.index, existing.length),
    });
  },
};

const updateDiagramTool: ToolDef = {
  name: "update_diagram",
  kind: "write",
  description:
    "Propose changes to an activity's existing diagram as a list of small operations (add_player, move, remove, set_label, set_side, give_ball, add_action, remove_action, set_step, set_path, add_text, add_zone, duplicate, clear_actions, set_court). The result is checked as a whole; if any operation is invalid nothing changes.",
  schema: z.strictObject({
    planId: optionalPlan,
    activityId: uuid,
    index: z.int().min(0).max(4).default(0),
    ops: diagramOpsSchema,
  }),
  async run(ctx, input) {
    const i = input as {
      planId?: string;
      activityId: string;
      index: number;
      ops: z.output<typeof diagramOpsSchema>;
    };
    const plan = await loadPlan(ctx, i.planId);
    if (isResult(plan)) return plan;
    if (!plan.permissions.canEdit) return no("read_only", "The coach cannot edit this session.");
    const activity = activityOf(plan, i.activityId);
    if (!activity) return no("not_found", "That activity is not in the session.");
    if (activity.locked) return lockedNo(activity.title);
    const current = diagramsOf(activity)[i.index];
    if (!current)
      return no("no_diagram", "That activity has no such diagram. Use create_diagram to make one.");
    const pack = getCourtPack(current.diagram.sport, current.diagram.court);
    if (!pack) return no("invalid_diagram", "That court does not exist for this sport.");
    const result = applyOps(current.diagram, i.ops, pack, (c) =>
      getCourtPack(current.diagram.sport, c),
    );
    if (!result.ok)
      return no(
        "invalid_diagram",
        "Those changes are not valid: " +
          result.issues
            .slice(0, 4)
            .map((x) => `${x.code} (${x.path})`)
            .join("; ") +
          ". Nothing was changed.",
      );
    return addProposal(ctx, {
      kind: "set_diagram",
      planId: plan.id,
      activityId: activity.id,
      title: activity.title,
      diagramTitle: current.title,
      diagram: result.diagram,
      replacing: true,
      index: i.index,
    });
  },
};

export const TOOLS: readonly ToolDef[] = [
  searchDrillsTool,
  getDrillTool,
  findMatchingTool,
  getObjectivesTool,
  getAgeGroupsTool,
  getSessionTool,
  validateSessionTool,
  generateSessionTool,
  createSessionTool as ToolDef,
  addActivityTool,
  replaceActivityTool,
  removeActivityTool,
  updateActivityTool,
  reorderActivityTool,
  changeDurationTool,
  changePlayerCountTool,
  changeObjectivesTool,
  createCustomTool,
  addBreakTool,
  createDiagramTool,
  updateDiagramTool,
];

export const toolByName = (name: string): ToolDef | undefined => TOOLS.find((t) => t.name === name);

/** JSON Schema for the model, from the same zod schemas that validate what it sends back. */
export function toolSpecs() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) as Record<
      string,
      unknown
    >,
  }));
}

const MAX_RESULT_CHARS = 7_000;

/**
 * Run one tool call from the model: unknown tool, invalid input, and any failure become an ERROR RESULT the model can read
 * and correct — never a crash and never a write. Input is parsed by the tool's own strict schema.
 */
export async function runTool(
  ctx: ToolContext,
  name: string,
  rawInput: unknown,
): Promise<{ text: string; isError: boolean; tool: string }> {
  const tool = toolByName(name);
  if (!tool)
    return {
      tool: name,
      isError: true,
      text: JSON.stringify({ error: "unknown_tool", message: `There is no tool “${name}”.` }),
    };
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success)
    return {
      tool: name,
      isError: true,
      text: JSON.stringify({
        error: "invalid_input",
        message: parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
          .join("; "),
      }),
    };
  try {
    const result = await tool.run(ctx, parsed.data);
    const text = JSON.stringify(
      result.ok ? result.data : { error: result.code, message: result.message },
    );
    return {
      tool: name,
      isError: !result.ok,
      text:
        text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) + "…(truncated)" : text,
    };
  } catch {
    return {
      tool: name,
      isError: true,
      text: JSON.stringify({ error: "failed", message: "That tool could not run." }),
    };
  }
}
