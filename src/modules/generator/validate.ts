import { PLAN_LIMITS } from "@/db/enums";
import type { Requirements } from "./requirements";
import { ageFit, equipmentShortfalls, levelFit, spaceFits } from "./rules";
import type {
  DrillCandidate,
  GeneratedItem,
  Issue,
  ObjectiveRule,
  ValidationReport,
} from "./types";

/**
 * Validating a session against what was asked (Step 8). Used on what the generator builds AND on what a coach (or the AI
 * assistant) has built by hand, so "is this session sound?" has one answer everywhere. Errors mean the session cannot be
 * run as asked (wrong total, not enough equipment, too few players); warnings mean it can, but a coach should look.
 * Pure: the drills are given, never fetched.
 */

export interface ValidateInput {
  items: readonly GeneratedItem[];
  req: Requirements;
  drills: ReadonlyMap<string, DrillCandidate>;
  objectives: readonly ObjectiveRule[];
}

const isDrill = (i: GeneratedItem) => i.kind === "drill" && i.drillId !== null;

export function validateSession({
  items,
  req,
  drills,
  objectives,
}: ValidateInput): ValidationReport {
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);
  const drillItems = items.filter(isDrill);

  if (items.length === 0 || drillItems.length === 0) {
    add({ code: "empty", severity: "error" });
    return { ok: false, issues };
  }
  if (items.length > PLAN_LIMITS.maxActivities)
    add({
      code: "too_many_activities",
      severity: "error",
      values: { count: items.length, max: PLAN_LIMITS.maxActivities },
    });

  const total = items.reduce((n, i) => n + i.durationMin, 0);
  if (total !== req.durationMin)
    add({
      code: "duration_mismatch",
      severity: "error",
      values: { total, wanted: req.durationMin },
    });

  const seen = new Set<string>();
  let highRun = 0;
  items.forEach((item, at) => {
    if (item.kind === "break") {
      highRun = 0;
      return;
    }
    const drill = item.drillId ? drills.get(item.drillId) : undefined;
    if (!drill) return;

    if (seen.has(drill.id))
      add({ code: "duplicate_drill", severity: "warning", at, values: { title: drill.title } });
    seen.add(drill.id);

    if (req.players < drill.playersMin)
      add({
        code: "players_below_min",
        severity: "error",
        at,
        values: { title: drill.title, min: drill.playersMin, players: req.players },
      });
    for (const s of equipmentShortfalls(drill, req))
      add({
        code: "equipment_short",
        severity: "error",
        at,
        values: { title: drill.title, key: s.key, need: s.need, have: s.have },
      });
    if (!spaceFits(drill, req))
      add({ code: "space_not_available", severity: "error", at, values: { title: drill.title } });
    if (ageFit(drill, req) === "outside")
      add({ code: "age_mismatch", severity: "warning", at, values: { title: drill.title } });
    if (levelFit(drill, req.level) === "too_hard")
      add({ code: "level_mismatch", severity: "warning", at, values: { title: drill.title } });

    const range = [Math.floor(drill.durationMin * 0.5), Math.ceil(drill.durationMax * 1.5)];
    if (item.durationMin < range[0]! || item.durationMin > range[1]!)
      add({
        code: "duration_outside_range",
        severity: "warning",
        at,
        values: {
          title: drill.title,
          minutes: item.durationMin,
          min: drill.durationMin,
          max: drill.durationMax,
        },
      });

    highRun = drill.intensity === "high" ? highRun + 1 : 0;
    if (highRun === 3)
      add({ code: "high_intensity_run", severity: "warning", at, values: { count: 3 } });
  });

  // a warm-up first and a cool-down last, once the session is long enough to have them
  const first = drillItems[0]!;
  const last = drillItems[drillItems.length - 1]!;
  const has = (item: GeneratedItem, phase: string) => {
    const d = item.drillId ? drills.get(item.drillId) : undefined;
    return item.phase === phase || Boolean(d?.phases.includes(phase as never));
  };
  if (req.durationMin >= 25 && !has(first, "warm_up"))
    add({ code: "no_warm_up", severity: "warning" });
  if (req.durationMin >= 40 && !has(last, "cool_down"))
    add({ code: "no_cool_down", severity: "warning" });

  // objectives: the main one must be served by the session (a warning: the coach may have chosen the drills on purpose)
  const wanted = [req.primaryObjective, ...req.secondaryObjectives].filter(Boolean);
  for (const key of wanted) {
    const objective = objectives.find((o) => o.key === key);
    if (!objective) continue;
    const served = drillItems.some((i) => {
      const d = i.drillId ? drills.get(i.drillId) : undefined;
      return d ? servesObjective(d, objective) : false;
    });
    if (!served)
      add({
        code: "objective_uncovered",
        severity: key === req.primaryObjective ? "error" : "warning",
        values: { objective: objective.name, key },
      });
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** Does this drill serve the objective: by its category, or any skill it trains (sub-skills included)? */
export function servesObjective(drill: DrillCandidate, objective: ObjectiveRule): boolean {
  if (objective.categoryKeys.includes(drill.category)) return true;
  const covered = new Set(objective.coveredSkillKeys);
  return [drill.primarySkill, ...drill.secondarySkills, ...drill.subSkills].some(
    (k) => k !== null && covered.has(k),
  );
}
