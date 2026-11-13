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

/**
 * The third dimension of a ball the diagram draws from above: how high it is off the floor (metres) and how far it has
 * turned (radians). Derived from the action that moves it — a pass arcs a little (a skip or overhead pass more, a bounce
 * pass touches the floor halfway), a shot climbs and drops into the rim, a dribble bounces in rhythm with the dribbler's
 * stride. Absent from `ballFx` = held still or lying on the floor.
 */
export interface BallFx {
  lift: number;
  spin: number;
  /** What is moving the ball, and how far through it (0-1) — lets a 3D view place a shot between hand and rim. */
  kind: "pass" | "bounce" | "lob" | "shot" | "dribble";
  u: number;
}

/** Peak height (metres above the hand) of a ball in flight, by kind of throw. */
export const PEAK_LIFT = {
  standard: 0.35,
  skip: 1.3,
  overhead: 1.3,
  shot: 3.2,
  dribble: 0.55,
} as const;
/** Metres of travel per dribble bounce. */
const DRIBBLE_STRIDE = 1.15;
const BALL_RADIUS = 0.12;

export function flightLift(
  kind: "standard" | "bounce" | "skip" | "overhead" | "shot",
  u: number,
): number {
  const k = clamp01(u);
  if (kind === "bounce") return 0.5 * Math.abs(Math.sin(2 * Math.PI * k));
  return PEAK_LIFT[kind] * Math.sin(Math.PI * k);
}

/** Height of a dribbled ball after the dribbler has covered `dist` metres: floor contact every stride. */
export function dribbleLift(dist: number): number {
  return PEAK_LIFT.dribble * Math.abs(Math.sin((Math.PI * dist) / DRIBBLE_STRIDE));
}

export interface Frame {
  /** Every entity's position at this moment, by id (balls included). */
  positions: Map<string, Pt>;
  /** The actions that have started in the current step: their lines are drawn while they play. */
  visibleActions: Set<string>;
  /** The step being played (0 for a diagram without actions). */
  step: number;
  /** Height and spin of each ball that is in the air or being dribbled. */
  ballFx: Map<string, BallFx>;
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
      frameAt: () => ({
        positions: restingPositions(d, pack),
        visibleActions: new Set(),
        step: 0,
        ballFx: new Map(),
      }),
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
    const ballFx = new Map<string, BallFx>();
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
        const flown = length(ra.points) * ease(u);
        if (a.type === "pass") {
          if (u >= 1) {
            holder = a.to; // caught: the ball travels with the receiver
            loose = undefined;
            ballFx.delete(id);
          } else {
            holder = undefined;
            loose = lerp(start, end, ease(u));
            const pk = a.kind ?? "standard";
            ballFx.set(id, {
              lift: flightLift(pk, u),
              spin: flown / BALL_RADIUS,
              kind: pk === "bounce" ? "bounce" : pk === "standard" ? "pass" : "lob",
              u,
            });
          }
        } else {
          holder = undefined;
          loose = lerp(start, end, ease(u)); // a shot ends at the target and stays there
          // backspin: a shot turns against its direction of travel
          if (u < 1)
            ballFx.set(id, {
              lift: flightLift("shot", u),
              spin: -flown / BALL_RADIUS,
              kind: "shot",
              u,
            });
          else ballFx.delete(id);
        }
      }
      if (holder) {
        const at = positions.get(holder) ?? starts.get(holder);
        if (at) positions.set(id, { x: at.x + BALL_OFFSET.x, y: at.y + BALL_OFFSET.y });
        // a holder on a dribble bounces the ball in rhythm with the ground they cover
        const dribble = plan.timed.find(
          (x) =>
            x.ra.action.type === "dribble" && (x.ra.action as { entity: string }).entity === holder,
        );
        if (dribble) {
          const u = clamp01((local - dribble.from) / (dribble.to - dribble.from || 1));
          if (u > 0 && u < 1) {
            const dist = length(dribble.ra.points) * ease(u);
            ballFx.set(id, {
              lift: dribbleLift(dist),
              spin: dist / BALL_RADIUS,
              kind: "dribble",
              u,
            });
          }
        }
      } else if (loose) positions.set(id, loose);
    }

    const visible = new Set(plan.timed.filter((x) => local >= x.from).map((x) => x.ra.action.id));
    return { positions, visibleActions: visible, step: plan.step, ballFx };
  }

  return { duration: clock, spans, frameAt };
}

/** Everyone where they start (used when there is nothing to play). */
function restingPositions(d: Diagram, pack: CourtPack): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const re of resolveDiagram(d, pack).resolved.entities) out.set(re.entity.id, re.at);
  return out;
}
