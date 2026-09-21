import type { DrillPhase } from "@/db/enums";
import type { Requirements } from "./requirements";
import {
  ageFit,
  equipmentNeed,
  groupsFor,
  INTENSITY_RANK,
  isEligible,
  LEVEL_RANK,
  levelFit,
  planSlots,
  slotIntensity,
  type DrillSlot,
} from "./rules";
import { servesObjective, validateSession } from "./validate";
import type {
  DrillCandidate,
  GeneratedItem,
  Issue,
  ObjectiveRule,
  Reason,
  ValidationReport,
} from "./types";

/**
 * The deterministic session generator (Step 8) — no AI, no randomness, no clock: the same request over the same drills
 * always gives the same session. It follows the plan in the specification exactly:
 *
 *   structured requirements → filter what cannot be run → rank what can → fill a balanced timeline → make the minutes add up
 *   → validate against the request → (the caller) create a normal, editable session.
 *
 * It chooses ONLY from the drills it is given; a drill that is not in the list cannot appear (that is what keeps an AI
 * that feeds it candidates from inventing library drills). Every choice carries its reasons, and the best alternatives.
 */

export interface GenerateInput {
  req: Requirements;
  drills: readonly DrillCandidate[];
  objectives: readonly ObjectiveRule[];
}

export interface GeneratedSession {
  items: GeneratedItem[];
  validation: ValidationReport;
  /** What the session needs, at its peak, of each counted item — for the coach's equipment list. */
  equipment: Record<string, number>;
  /** How many drills were on the table after filtering (a "no results" answer can say why). */
  considered: { total: number; eligible: number };
}

const MIN_DRILL_MINUTES = 3;

/** A stable 0..1 number from text (FNV-1a): the only "randomness", and it is reproducible. */
function unit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

interface Scored {
  drill: DrillCandidate;
  score: number;
  reasons: Reason[];
}

interface Context {
  req: Requirements;
  /** The minutes this slot is expected to get (before fine-tuning). */
  target: number;
  primary: ObjectiveRule | undefined;
  secondary: ObjectiveRule[];
  used: DrillCandidate[];
}

function scoreDrill(drill: DrillCandidate, slot: DrillSlot, ctx: Context): Scored {
  const { req } = ctx;
  const reasons: Reason[] = [];
  let score = 0;
  // generic blocks (warm-up, cool-down) matter less for the objective; the teaching and game blocks matter most
  const weight = slot.phase === "warm_up" || slot.phase === "cool_down" ? 0.4 : 1;

  if (ctx.primary && servesObjective(drill, ctx.primary)) {
    const direct =
      (drill.primarySkill !== null && ctx.primary.coveredSkillKeys.includes(drill.primarySkill)) ||
      ctx.primary.categoryKeys.includes(drill.category);
    score += (direct ? 46 : 26) * weight;
    reasons.push({ code: "primary_objective", values: { objective: ctx.primary.name } });
  }
  for (const o of ctx.secondary) {
    if (servesObjective(drill, o)) {
      score += 14 * weight;
      reasons.push({ code: "secondary_objective", values: { objective: o.name } });
    }
  }

  if (drill.phases[0] === slot.phase) {
    score += 8;
    reasons.push({ code: "phase_fit", values: { phase: slot.phase } });
  } else if (drill.phases.includes(slot.phase)) score += 4;

  const level = levelFit(drill, req.level);
  if (level === "exact") {
    score += 10;
    reasons.push({ code: "level_fit", values: { level: drill.level } });
  } else if (level === "easier") score += 4;
  else if (level === "harder") score += 2;

  const age = ageFit(drill, req);
  if (age === "within") {
    score += 8;
    reasons.push({ code: "age_fit" });
  } else if (age === "overlap") score += 3;

  const groups = groupsFor(drill, req.players);
  if (req.players >= drill.playersMin && req.players <= drill.playersMax) {
    score += 8;
    reasons.push({ code: "players_fit", values: { players: req.players } });
  } else if (groups > 1) {
    score -= 4 * (groups - 1);
    reasons.push({ code: "groups", values: { groups } });
  }

  const wanted = slotIntensity(slot.phase, req.intensity);
  if (drill.intensity === wanted) {
    score += 6;
    reasons.push({ code: "intensity_fit", values: { intensity: drill.intensity } });
  } else if (Math.abs(INTENSITY_RANK[drill.intensity] - INTENSITY_RANK[wanted]) === 1) score += 2;

  if (drill.format && req.formats.includes(drill.format)) score += 6;
  if (req.space === "half" && drill.space === "half_court") score += 2;

  // variety: not the same category or main skill twice; not two high-intensity blocks in a row
  const sameCategory = ctx.used.filter((u) => u.category === drill.category).length;
  const sameSkill = ctx.used.filter(
    (u) => u.primarySkill !== null && u.primarySkill === drill.primarySkill,
  ).length;
  if (sameCategory === 0 && ctx.used.length > 0) reasons.push({ code: "variety" });
  score -= 12 * sameCategory + 6 * sameSkill;
  const previous = ctx.used[ctx.used.length - 1];
  if (previous && previous.intensity === "high" && drill.intensity === "high") score -= 8;

  // progression across the teaching blocks: from easier to harder
  if (slot.phase === "skill" && previous && LEVEL_RANK[drill.level] >= LEVEL_RANK[previous.level])
    score += 2;

  // does the drill fill this many minutes? A three-minute drill cannot carry a fifteen-minute block
  const lo = Math.floor(drill.durationMin * 0.75);
  const hi = Math.ceil(drill.durationMax * 1.25);
  if (ctx.target >= lo && ctx.target <= hi) score += 8;
  else score -= Math.min(24, (ctx.target < lo ? lo - ctx.target : ctx.target - hi) * 1.5);

  // a reproducible tie-breaker; other variants reshuffle drills that are nearly tied
  const noise = unit(`${drill.id}:${req.variant}`) * (req.variant === 0 ? 0.5 : 16);
  return { drill, score: score + noise, reasons };
}

const byScore = (a: Scored, b: Scored) =>
  b.score - a.score ||
  a.drill.title.localeCompare(b.drill.title) ||
  a.drill.id.localeCompare(b.drill.id);

/** Share `total` minutes over drills so each stays as close to its own range as it can and the sum is EXACT. */
function allocateMinutes(chosen: DrillCandidate[], weights: number[], total: number): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  const lo = chosen.map((d) => Math.max(MIN_DRILL_MINUTES, Math.floor(d.durationMin * 0.75)));
  const hi = chosen.map((d, i) => Math.max(lo[i]!, Math.ceil(d.durationMax * 1.25)));
  const out = chosen.map((_, i) =>
    Math.min(hi[i]!, Math.max(lo[i]!, Math.round((total * weights[i]!) / sumW))),
  );
  let diff = total - out.reduce((a, b) => a + b, 0);
  let stretch = 0;
  // hand out (or take back) one minute at a time, to the slots with room, biggest share first
  const order = chosen.map((_, i) => i).sort((a, b) => weights[b]! - weights[a]! || a - b);
  while (diff !== 0) {
    let moved = false;
    for (const i of order) {
      if (diff > 0 && out[i]! < hi[i]!) {
        out[i]!++;
        diff--;
        moved = true;
      } else if (diff < 0 && out[i]! > lo[i]!) {
        out[i]!--;
        diff++;
        moved = true;
      }
      if (diff === 0) break;
    }
    if (!moved) {
      // every slot is at the edge of its range: stretch the ranges (still sensible), then spread the rest evenly
      if (stretch < 2) {
        stretch++;
        for (let i = 0; i < chosen.length; i++) {
          lo[i] = Math.max(
            MIN_DRILL_MINUTES,
            Math.floor(chosen[i]!.durationMin * (stretch === 1 ? 0.5 : 0.25)),
          );
          hi[i] = Math.max(lo[i]!, Math.ceil(chosen[i]!.durationMax * (stretch === 1 ? 1.6 : 2.5)));
        }
        continue;
      }
      const i = order[Math.abs(diff) % order.length]!;
      out[i] = Math.max(1, out[i]! + Math.sign(diff));
      diff -= Math.sign(diff);
    }
  }
  return out;
}

export function generateSession({ req, drills, objectives }: GenerateInput): GeneratedSession {
  const primary = objectives.find((o) => o.key === req.primaryObjective);
  const secondary = req.secondaryObjectives.flatMap((k) => objectives.filter((o) => o.key === k));
  const pool = drills.filter((d) => !req.exclude.includes(d.id));
  const eligible = pool.filter((d) => isEligible(d, req));

  const slots = planSlots(req.durationMin, req.sessionType);
  const issues: Issue[] = [];

  // chosen drills, per slot index; locked ones (asked for by id) are placed first
  const assigned = new Map<number, { scored: Scored; locked: boolean }>();
  const totalWeight = slots.reduce((n, s) => (s.kind === "drill" ? n + s.weight : n), 0);
  const drillMinutes =
    req.durationMin - slots.reduce((n, s) => (s.kind === "break" ? n + s.minutes : n), 0);
  const targetOf = (slot: DrillSlot) =>
    Math.round((drillMinutes * slot.weight) / Math.max(1, totalWeight));
  const ctxFor = (used: DrillCandidate[], slot: DrillSlot): Context => ({
    req,
    primary,
    secondary,
    used,
    target: targetOf(slot),
  });

  for (const id of req.mustInclude) {
    const drill = eligible.find((d) => d.id === id);
    if (!drill) continue; // not a real, runnable drill for this request: it is simply not added (the caller is told)
    const open = slots
      .map((s, i) => ({ s, i }))
      .filter((x): x is { s: DrillSlot; i: number } => x.s.kind === "drill" && !assigned.has(x.i));
    const best =
      open.find((x) => drill.phases.includes(x.s.phase)) ??
      open.find((x) => x.s.phase === "skill") ??
      open[0];
    if (!best) continue;
    const scored = scoreDrill(drill, best.s, ctxFor([], best.s));
    scored.reasons.unshift({ code: "locked" });
    assigned.set(best.i, { scored, locked: true });
  }

  // fill the rest in order, so variety and progression see what came before
  const alternativesAt = new Map<number, Scored[]>();
  slots.forEach((slot, index) => {
    if (slot.kind !== "drill" || assigned.has(index)) return;
    const taken = new Set([...assigned.values()].map((a) => a.scored.drill.id));
    const before = slots
      .slice(0, index)
      .map((_, i) => assigned.get(i)?.scored.drill)
      .filter((d): d is DrillCandidate => Boolean(d));
    const ctx = ctxFor(before, slot);
    let candidates = eligible.filter((d) => !taken.has(d.id) && d.phases.includes(slot.phase));
    let relaxed = false;
    if (candidates.length === 0) {
      // nothing is tagged for this slot: take the closest kind of drill rather than leave a hole
      const near: DrillPhase[] =
        slot.phase === "game"
          ? ["small_sided", "skill"]
          : slot.phase === "small_sided"
            ? ["game", "skill"]
            : slot.phase === "conditioning"
              ? ["warm_up", "small_sided"]
              : ["skill", "warm_up", "small_sided"];
      candidates = eligible.filter(
        (d) => !taken.has(d.id) && d.phases.some((p) => near.includes(p)),
      );
      relaxed = candidates.length > 0;
    }
    if (candidates.length === 0) {
      issues.push({
        code: "no_drill_for_phase",
        severity: "warning",
        values: { phase: slot.phase },
      });
      return;
    }
    const ranked = candidates.map((d) => scoreDrill(d, slot, ctx)).sort(byScore);
    const top = ranked[0]!;
    if (relaxed)
      issues.push({
        code: "no_drill_for_phase",
        severity: "warning",
        values: { phase: slot.phase },
      });
    assigned.set(index, { scored: top, locked: false });
    alternativesAt.set(index, ranked.slice(1, 4));
  });

  // the minutes: breaks are fixed, drills share the rest, and the total is exact
  const drillIdx = slots
    .map((s, i) => (s.kind === "drill" && assigned.has(i) ? i : -1))
    .filter((i) => i >= 0);
  const chosen = drillIdx.map((i) => assigned.get(i)!.scored.drill);
  const weights = drillIdx.map((i) => (slots[i] as DrillSlot).weight);
  // a break with nothing on either side, or at the very start or end, is dropped
  const keepBreak = (i: number) => {
    const before = drillIdx.some((d) => d < i);
    const after = drillIdx.some((d) => d > i);
    return before && after;
  };
  const kept = slots.filter((s, i) => (s.kind === "drill" ? assigned.has(i) : keepBreak(i)));
  const keptBreakMinutes = kept.reduce((n, s) => (s.kind === "break" ? n + s.minutes : n), 0);

  const items: GeneratedItem[] = [];
  if (chosen.length > 0) {
    const minutes = allocateMinutes(
      chosen,
      weights,
      Math.max(chosen.length, req.durationMin - keptBreakMinutes),
    );
    let n = 0;
    slots.forEach((slot, i) => {
      if (slot.kind === "break") {
        if (keepBreak(i))
          items.push({
            kind: "break",
            drillId: null,
            title: "",
            phase: null,
            durationMin: slot.minutes,
            groups: 1,
            reasons: [],
            alternatives: [],
            locked: false,
          });
        return;
      }
      const pick = assigned.get(i);
      if (!pick) return;
      const d = pick.scored.drill;
      const groups = groupsFor(d, req.players);
      const reasons = [...pick.scored.reasons];
      if (req.baskets !== null || Object.keys(req.equipment).length > 0)
        reasons.push({ code: "equipment_ok" });
      items.push({
        kind: "drill",
        drillId: d.id,
        title: d.title,
        phase: slot.phase,
        durationMin: minutes[n++]!,
        groups,
        reasons,
        alternatives: (alternativesAt.get(i) ?? []).map((a) => ({
          drillId: a.drill.id,
          title: a.drill.title,
          score: Math.round(a.score),
        })),
        locked: pick.locked,
      });
    });
  }

  // the alternatives offered for a slot must not be drills another slot already uses (choosing one would duplicate it)
  items.forEach((item, index) => {
    if (item.kind === "drill")
      item.alternatives = alternativesFor({ req, drills, objectives, items, index });
  });

  const byId = new Map(drills.map((d) => [d.id, d]));
  const report = validateSession({ items, req, drills: byId, objectives });
  const validation: ValidationReport = {
    issues: [...issues, ...report.issues],
    ok: report.ok && !issues.some((i) => i.severity === "error"),
  };

  return {
    items,
    validation,
    equipment: equipmentPeak(items, byId, req.players),
    considered: { total: pool.length, eligible: eligible.length },
  };
}

/** What a session needs, at its peak, of each counted item — activities run one after another, so it is the largest single need. */
export function equipmentPeak(
  items: readonly GeneratedItem[],
  drills: ReadonlyMap<string, DrillCandidate>,
  players: number,
): Record<string, number> {
  const peak: Record<string, number> = {};
  for (const item of items) {
    const d = item.drillId ? drills.get(item.drillId) : undefined;
    if (!d) continue;
    for (const [key, need] of Object.entries(equipmentNeed(d, players, groupsFor(d, players))))
      peak[key] = Math.max(peak[key] ?? 0, need);
  }
  return peak;
}

/** The best other drills for one activity of a session: what "replace this drill" offers, ranked like the generator ranks. */
export function alternativesFor({
  req,
  drills,
  objectives,
  items,
  index,
}: GenerateInput & {
  items: readonly GeneratedItem[];
  index: number;
}): GeneratedItem["alternatives"] {
  const item = items[index];
  if (!item || item.kind !== "drill" || !item.phase) return [];
  const byId = new Map(drills.map((d) => [d.id, d]));
  const others = items.filter((_, i) => i !== index).map((i) => i.drillId);
  const before = items
    .slice(0, index)
    .map((i) => (i.drillId ? byId.get(i.drillId) : undefined))
    .filter((d): d is DrillCandidate => Boolean(d));
  const ctx: Context = {
    req,
    target: item.durationMin,
    primary: objectives.find((o) => o.key === req.primaryObjective),
    secondary: req.secondaryObjectives.flatMap((k) => objectives.filter((o) => o.key === k)),
    used: before,
  };
  const slot: DrillSlot = { kind: "drill", phase: item.phase, weight: 1 };
  return drills
    .filter(
      (d) =>
        d.id !== item.drillId &&
        !others.includes(d.id) &&
        !req.exclude.includes(d.id) &&
        d.phases.includes(item.phase!) &&
        isEligible(d, req),
    )
    .map((d) => scoreDrill(d, slot, ctx))
    .sort(byScore)
    .slice(0, 3)
    .map((a) => ({ drillId: a.drill.id, title: a.drill.title, score: Math.round(a.score) }));
}

/** The drills that best fit a request for one kind of block, best first: what "find me drills for…" answers, ranked like the generator ranks. */
export function rankDrills({
  req,
  drills,
  objectives,
  phase = "skill",
  limit = 8,
}: GenerateInput & { phase?: DrillPhase; limit?: number }): Array<{
  drill: DrillCandidate;
  score: number;
  reasons: Reason[];
}> {
  const ctx: Context = {
    req,
    target: 0,
    primary: objectives.find((o) => o.key === req.primaryObjective),
    secondary: req.secondaryObjectives.flatMap((k) => objectives.filter((o) => o.key === k)),
    used: [],
  };
  return drills
    .filter((d) => !req.exclude.includes(d.id) && isEligible(d, req))
    .map((d) => {
      const slot: DrillSlot = { kind: "drill", phase, weight: 1 };
      const at = Math.round((d.durationMin + d.durationMax) / 2);
      return scoreDrill(d, slot, { ...ctx, target: at });
    })
    .sort(byScore)
    .slice(0, Math.max(1, limit))
    .map((s) => ({ drill: s.drill, score: Math.round(s.score), reasons: s.reasons }));
}
