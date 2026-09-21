import type { DrillPhase, Intensity, Level } from "@/db/enums";
import { availableOf, type Requirements } from "./requirements";
import type { DrillCandidate, SessionType } from "./types";

/**
 * The rules the generator and the validator share (Step 8): can this drill be run with THESE players, THIS equipment and
 * THIS space, how well does it fit the age and level, and what does a session of N minutes look like. Pure and
 * deterministic — no randomness, no clock, no I/O — so a request always gives the same answer.
 */

export const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
export const INTENSITY_RANK: Record<Intensity, number> = { low: 0, medium: 1, high: 2 };

/** Players split into this many groups when the drill is smaller than the squad (each group needs its own equipment). */
export const MAX_GROUPS = 6;
export const groupsFor = (drill: Pick<DrillCandidate, "playersMax">, players: number): number =>
  Math.max(1, Math.ceil(players / Math.max(1, drill.playersMax)));

/** How much of each equipment key running this drill with `players` players (in `groups` groups) takes at once. */
export function equipmentNeed(
  drill: Pick<DrillCandidate, "equipment">,
  players: number,
  groups: number,
): Record<string, number> {
  const need: Record<string, number> = {};
  for (const e of drill.equipment) {
    const n =
      e.rule === "fixed"
        ? e.quantity * groups
        : e.rule === "per_player"
          ? e.quantity * players
          : e.quantity * Math.ceil(players / 2);
    need[e.key] = (need[e.key] ?? 0) + n;
  }
  return need;
}

export interface Shortfall {
  key: string;
  need: number;
  have: number;
}

/** Equipment the coach has counted and this drill would need more of. Uncounted equipment is never a shortfall. */
export function equipmentShortfalls(
  drill: Pick<DrillCandidate, "equipment" | "playersMax">,
  req: Pick<Requirements, "players" | "baskets" | "equipment">,
): Shortfall[] {
  const groups = groupsFor(drill, req.players);
  const out: Shortfall[] = [];
  for (const [key, need] of Object.entries(equipmentNeed(drill, req.players, groups))) {
    const have = availableOf(req, key);
    if (have !== null && need > have) out.push({ key, need, have });
  }
  return out;
}

/** Does the space the coach has allow this drill? A full-court drill needs a full court; half-court and "any" fit anywhere. */
export const spaceFits = (
  drill: Pick<DrillCandidate, "space">,
  req: Pick<Requirements, "space">,
) => (req.space === "half" ? drill.space !== "full_court" : true);

export type AgeFit = "within" | "overlap" | "outside" | "unknown";
export function ageFit(
  drill: Pick<DrillCandidate, "ageMin" | "ageMax">,
  req: Pick<Requirements, "ageMin" | "ageMax">,
): AgeFit {
  if (req.ageMin === null || req.ageMax === null) return "unknown";
  if (drill.ageMin <= req.ageMin && drill.ageMax >= req.ageMax) return "within";
  if (drill.ageMin <= req.ageMax && drill.ageMax >= req.ageMin) return "overlap";
  return "outside";
}

/**
 * How a drill's level compares with the level asked for: `exact`, `easier` (safe), `harder` (one step up, fine for a
 * group that is not beginners) or `too_hard`. Beginners are never given a drill above beginner.
 */
export type LevelFit = "exact" | "easier" | "harder" | "too_hard" | "unknown";
export function levelFit(drill: Pick<DrillCandidate, "level">, level: Level | ""): LevelFit {
  if (!level) return "unknown";
  const d = LEVEL_RANK[drill.level] - LEVEL_RANK[level];
  if (d === 0) return "exact";
  if (d < 0) return "easier";
  return level === "beginner" || d > 1 ? "too_hard" : "harder";
}

/** What a drill must be to be on the table at all: right size for the squad, the space and the equipment, and not far too hard or too old/young. */
export function isEligible(
  drill: DrillCandidate,
  req: Pick<
    Requirements,
    "players" | "baskets" | "equipment" | "space" | "ageMin" | "ageMax" | "level"
  >,
): boolean {
  if (req.players < drill.playersMin) return false;
  if (groupsFor(drill, req.players) > MAX_GROUPS) return false;
  if (!spaceFits(drill, req)) return false;
  if (ageFit(drill, req) === "outside") return false;
  if (levelFit(drill, req.level) === "too_hard") return false;
  return equipmentShortfalls(drill, req).length === 0;
}

// ---- the shape of a session ----------------------------------------------------------------------------------------

export type DrillSlot = { kind: "drill"; phase: DrillPhase; weight: number };
export type BreakSlot = { kind: "break"; minutes: number };
export type Slot = DrillSlot | BreakSlot;

const drill = (phase: DrillPhase, weight: number): DrillSlot => ({ kind: "drill", phase, weight });
const rest = (minutes: number): BreakSlot => ({ kind: "break", minutes });

/**
 * The skeleton of a session of `total` minutes: a warm-up, teaching blocks, then game-like work, then a cool-down, with a
 * water break when the session is long enough. Weights say how the drill minutes are shared; breaks are fixed.
 */
export function planSlots(total: number, type: SessionType): Slot[] {
  const breakMin = total >= 100 ? 4 : 3;
  let slots: Slot[];
  if (total < 12) slots = [drill("skill", 1)];
  else if (total < 25) slots = [drill("warm_up", 1), drill("skill", 3)];
  else if (total < 40) slots = [drill("warm_up", 1.5), drill("skill", 4), drill("cool_down", 1)];
  else if (total < 55)
    slots = [
      drill("warm_up", 1.5),
      drill("skill", 3.5),
      drill("small_sided", 3),
      drill("cool_down", 1),
    ];
  else if (total < 75)
    slots = [
      drill("warm_up", 1.5),
      drill("skill", 3),
      drill("skill", 3),
      ...(total >= 60 ? [rest(breakMin)] : []),
      drill("small_sided", 3),
      drill("cool_down", 1),
    ];
  else if (total < 100)
    slots = [
      drill("warm_up", 1.5),
      drill("skill", 3),
      drill("skill", 3),
      rest(breakMin),
      drill("small_sided", 3),
      drill("game", 3),
      drill("cool_down", 1),
    ];
  else if (total < 140)
    slots = [
      drill("warm_up", 1.5),
      drill("skill", 3),
      drill("skill", 3),
      rest(breakMin),
      drill("small_sided", 3),
      drill("small_sided", 2.5),
      rest(breakMin),
      drill("game", 3),
      drill("cool_down", 1),
    ];
  else
    slots = [
      drill("warm_up", 1.5),
      drill("skill", 3),
      drill("skill", 3),
      drill("skill", 3),
      rest(breakMin),
      drill("small_sided", 3),
      drill("small_sided", 3),
      rest(breakMin),
      drill("game", 3),
      drill("game", 2.5),
      drill("cool_down", 1),
    ];

  // the kind of session changes the middle, never the warm-up or the cool-down
  const swap = (from: DrillPhase, to: DrillPhase) => {
    const i = slots.findIndex((s) => s.kind === "drill" && s.phase === from);
    if (i >= 0) slots[i] = { ...(slots[i] as DrillSlot), phase: to };
  };
  if (type === "skills") {
    swap("game", "skill");
    if (total >= 75) swap("small_sided", "skill");
  } else if (type === "game_prep") {
    if (total >= 55) swap("skill", "small_sided");
    if (!slots.some((s) => s.kind === "drill" && s.phase === "game") && total >= 40)
      swap("small_sided", "game");
  } else if (type === "conditioning" && total >= 40) {
    const at = slots.findIndex((s) => s.kind === "drill" && s.phase === "cool_down");
    const cond = drill("conditioning", 2);
    if (at >= 0) slots.splice(at, 0, cond);
    else slots.push(cond);
  }
  return slots;
}

/** The intensity a slot wants, nudged by what the coach asked for overall. */
export function slotIntensity(phase: DrillPhase, wanted: Intensity | ""): Intensity {
  const base: Record<DrillPhase, Intensity> = {
    warm_up: "low",
    skill: "medium",
    small_sided: "high",
    game: "high",
    conditioning: "high",
    cool_down: "low",
  };
  const b = base[phase];
  if (!wanted || phase === "warm_up" || phase === "cool_down") return b;
  if (wanted === "low") return b === "high" ? "medium" : "low";
  if (wanted === "high") return b === "low" ? "medium" : "high";
  return b;
}
