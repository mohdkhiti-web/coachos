import type { CourtPack, Pt } from "./pack";
import { BALL_OFFSET, isMover, resolveDiagram, type ResolvedAction } from "./resolve";
import { pointAlong } from "./render/geometry";
import type { Diagram } from "./schema";
import { holdersAtStep } from "./steps";

/**
 * Playback: a drill's structured data (who moves where, who passes to whom, who shoots) turned into a timeline that can be
 * asked "where is everything at time t?". No animation is stored and none is invented — the movement comes from the same
 * paths that are drawn, so the animation can never disagree with the diagram. Pure and deterministic (no clock, no DOM):
 * the workspace advances `t`; the renderer draws the frame.
 *
 * Within a step everything starts together, except passes and shots, which leave a moment after the movers have started
 * (a cutter is already moving when the pass is released). Each step begins where the previous one left everyone.
 */

/** Metres per second by kind of movement — chosen to look like real basketball at a glance, not to be a physics model. */
const SPEED: Record<string, number> = {
  move: 3.2,
  dribble: 3.4,
  cut: 4.8,
  sprint: 6.2,
  defend: 2.8,
  screen: 3.0,
};
const PASS_SPEED = 10;
const SHOT_SPEED = 8;
const MIN_MOVE_S = 0.7;
const MIN_BALL_S = 0.4;
/** Balls leave after this fraction of the longest movement in the step. */
const RELEASE_AT = 0.3;
/** A short rest at the end of every step so the eye can follow. */
const HOLD_S = 0.45;

export interface StepSpan {
  step: number;
  start: number;
  end: number;
}

export interface Frame {
  /** Every entity's position at this moment, by id (balls included). */
  positions: Map<string, Pt>;
  /** The actions that have started in the current step: their lines are drawn while they play. */
  visibleActions: Set<string>;
  /** The step being played (0 for a diagram without actions). */
  step: number;
}

export interface Timeline {
  /** Seconds at normal speed. 0 = nothing to play. */
  duration: number;
  spans: readonly StepSpan[];
  frameAt(t: number): Frame;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const length = (pts: readonly Pt[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total;
};
const lerp = (a: Pt, b: Pt, u: number): Pt => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
});

interface Timed {
  ra: ResolvedAction;
  /** Seconds from the start of the step. */
  from: number;
  to: number;
}

export function buildTimeline(d: Diagram, pack: CourtPack): Timeline {
  const { resolved } = resolveDiagram(d, pack);
  const steps = resolved.steps.filter((s) => resolved.actions.some((a) => a.step === s));
  if (steps.length === 0) {
    return {
      duration: 0,
      spans: [],
      frameAt: () => ({ positions: restingPositions(d, pack), visibleActions: new Set(), step: 0 }),
    };
  }

  const plans = steps.map((s) => {
    const inStep = resolved.actions.filter((a) => a.step === s);
    const timed: Timed[] = [];
    let moveEnd = 0;
    for (const ra of inStep) {
      if (!isMover(ra.action) && ra.action.type !== "screen") continue;
      const speed = SPEED[ra.action.type] ?? SPEED.move!;
      const to = Math.max(MIN_MOVE_S, length(ra.points) / speed);
      timed.push({ ra, from: 0, to });
      moveEnd = Math.max(moveEnd, to);
    }
    const release = moveEnd * RELEASE_AT;
    let end = moveEnd;
    for (const ra of inStep) {
      if (ra.action.type !== "pass" && ra.action.type !== "shot") continue;
      const speed = ra.action.type === "pass" ? PASS_SPEED : SHOT_SPEED;
      const flight = Math.max(MIN_BALL_S, length(ra.points) / speed);
      timed.push({ ra, from: release, to: release + flight });
      end = Math.max(end, release + flight);
    }
    return { step: s, timed, length: end + HOLD_S };
  });

  const spans: StepSpan[] = [];
  let clock = 0;
  for (const p of plans) {
    spans.push({ step: p.step, start: clock, end: clock + p.length });
    clock += p.length;
  }

  function frameAt(t: number): Frame {
    const time = Math.max(0, Math.min(clock, t));
    const idx = Math.max(
      0,
      spans.findIndex((s) => time < s.end),
    );
    const at = time >= clock ? spans.length - 1 : idx;
    const span = spans[at]!;
    const plan = plans[at]!;
    const local = time - span.start;

    const starts = resolved.stepStarts.get(plan.step) ?? new Map<string, Pt>();
    const positions = new Map<string, Pt>();
    for (const re of resolved.entities) {
      if (re.entity.type !== "ball") positions.set(re.entity.id, starts.get(re.entity.id) ?? re.at);
    }

    // movers walk their path
    for (const { ra, from, to } of plan.timed) {
      if (!isMover(ra.action) && ra.action.type !== "screen") continue;
      const u = to === from ? 1 : clamp01((local - from) / (to - from));
      positions.set((ra.action as { entity: string }).entity, pointAlong(ra.points, ease(u)));
    }

    // balls: with their holder, in the air, or where they lie
    const holders = holdersAtStep(d, plan.step);
    const flights = plan.timed.filter(
      (x) => x.ra.action.type === "pass" || x.ra.action.type === "shot",
    );
    for (const re of resolved.entities) {
      if (re.entity.type !== "ball") continue;
      const id = re.entity.id;
      let holder = holders.get(id);
      let loose: Pt | undefined = holder ? undefined : (starts.get(id) ?? re.at);
      for (const { ra, from, to } of flights) {
        const a = ra.action;
        const thrower = a.type === "pass" ? a.from : (a as { entity: string }).entity;
        if (holder !== thrower) continue;
        const u = to === from ? 1 : clamp01((local - from) / (to - from));
        if (local < from) continue; // not thrown yet: still held
        const start = ra.points[0]!;
        const end = ra.points[ra.points.length - 1]!;
        if (a.type === "pass") {
          if (u >= 1) {
            holder = a.to; // caught: the ball travels with the receiver
            loose = undefined;
          } else {
            holder = undefined;
            loose = lerp(start, end, ease(u));
          }
        } else {
          holder = undefined;
          loose = lerp(start, end, ease(u)); // a shot ends at the target and stays there
        }
      }
      if (holder) {
        const at = positions.get(holder) ?? starts.get(holder);
        if (at) positions.set(id, { x: at.x + BALL_OFFSET.x, y: at.y + BALL_OFFSET.y });
      } else if (loose) positions.set(id, loose);
    }

    const visible = new Set(plan.timed.filter((x) => local >= x.from).map((x) => x.ra.action.id));
    return { positions, visibleActions: visible, step: plan.step };
  }

  return { duration: clock, spans, frameAt };
}

/** Everyone where they start (used when there is nothing to play). */
function restingPositions(d: Diagram, pack: CourtPack): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const re of resolveDiagram(d, pack).resolved.entities) out.set(re.entity.id, re.at);
  return out;
}
