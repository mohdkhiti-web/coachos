import type { CourtPack, Pt } from "./pack";
import type { Action, Annotation, Diagram, Entity, Position } from "./schema";

/**
 * Pure geometry resolution: turns a diagram's symbolic positions (anchors, offsets, entity
 * references) and steps into concrete metre coordinates. No DOM, no framework, no sport knowledge —
 * everything sport-specific arrives through the CourtPack.
 */

export type Issue = { path: string; code: string; params?: Record<string, string | number> };

export const PLAYER_RADIUS = 0.42;
export const BALL_OFFSET: Pt = { x: 0.46, y: -0.4 };
const SCREEN_STANDOFF = 0.8;

export const isCarrier = (e: Entity) => e.type === "player" || e.type === "coach";

export interface ResolvedEntity {
  entity: Entity;
  at: Pt;
}

export interface ResolvedAction {
  action: Action;
  step: number;
  /** Polyline through centres, before end-cutting. */
  points: Pt[];
  /** Metres to trim from the start / end so lines don't run through the shapes. */
  startCut: number;
  endCut: number;
  tbar: boolean;
}

export interface ResolvedAnnotation {
  annotation: Annotation;
  a: Pt;
  b?: Pt;
}

export interface Resolved {
  entities: ResolvedEntity[];
  actions: ResolvedAction[];
  annotations: ResolvedAnnotation[];
  /** Distinct step numbers in ascending order. */
  steps: number[];
}

const add = (p: Pt, o?: readonly [number, number]): Pt => ({
  x: p.x + (o?.[0] ?? 0),
  y: p.y + (o?.[1] ?? 0),
});

function resolvePos(
  pos: Position,
  pack: CourtPack,
  entityAt: (id: string) => Pt | undefined,
  path: string,
  issues: Issue[],
): Pt | undefined {
  if ("x" in pos) return { x: pos.x, y: pos.y };
  if ("anchor" in pos) {
    const a = pack.anchors[pos.anchor];
    if (!a) {
      issues.push({ path, code: "unknown_anchor", params: { anchor: pos.anchor } });
      return undefined;
    }
    return add(a, pos.offset);
  }
  const base = entityAt(pos.entity);
  if (!base) {
    issues.push({ path, code: "unknown_entity", params: { id: pos.entity } });
    return undefined;
  }
  return add(base, pos.offset);
}

export function resolveDiagram(
  d: Diagram,
  pack: CourtPack,
): { resolved: Resolved; issues: Issue[] } {
  const issues: Issue[] = [];
  const byId = new Map<string, Entity>();
  d.entities.forEach((e, i) => {
    if (byId.has(e.id))
      issues.push({ path: `entities[${i}].id`, code: "duplicate_id", params: { id: e.id } });
    else byId.set(e.id, e);
  });

  // Pass 1: entities positioned absolutely or by anchor. Pass 2: entities positioned relative to one
  // of those (a reference to another reference is rejected — no chains, no cycles).
  const start = new Map<string, Pt>();
  const refs: Array<{ e: Entity; i: number }> = [];
  d.entities.forEach((e, i) => {
    if (e.type === "ball") return;
    if ("entity" in e.at) refs.push({ e, i });
    else {
      const p = resolvePos(e.at, pack, () => undefined, `entities[${i}].at`, issues);
      if (p) start.set(e.id, p);
    }
  });
  const refIds = new Set(refs.map((r) => r.e.id));
  for (const { e, i } of refs) {
    if (e.type === "ball") continue;
    const at = e.at as { entity: string; offset?: [number, number] };
    if (refIds.has(at.entity)) {
      issues.push({
        path: `entities[${i}].at`,
        code: "nested_reference",
        params: { id: at.entity },
      });
      continue;
    }
    const p = resolvePos(e.at, pack, (id) => start.get(id), `entities[${i}].at`, issues);
    if (p) start.set(e.id, p);
  }

  // Balls sit beside their holder, or at an explicit position.
  const ballAt = new Map<string, Pt>();
  d.entities.forEach((e, i) => {
    if (e.type !== "ball") return;
    if (e.heldBy) {
      const holder = byId.get(e.heldBy);
      const p = start.get(e.heldBy);
      if (!holder || !isCarrier(holder) || !p) {
        issues.push({
          path: `entities[${i}].heldBy`,
          code: "ball_holder_invalid",
          params: { id: e.heldBy },
        });
        return;
      }
      ballAt.set(e.id, { x: p.x + BALL_OFFSET.x, y: p.y + BALL_OFFSET.y });
    } else if (e.at) {
      const p = resolvePos(e.at, pack, (id) => start.get(id), `entities[${i}].at`, issues);
      if (p) ballAt.set(e.id, p);
    }
  });

  // Actions, step by step. A mover's position for step n is where its earlier movements left it.
  const actions: ResolvedAction[] = [];
  const steps = [...new Set(d.actions.map((a) => a.step))].sort((a, b) => a - b);
  const current = new Map(start);
  for (const s of steps) {
    const pending = new Map<string, Pt>();
    d.actions.forEach((a, i) => {
      if (a.step !== s) return;
      const path = `actions[${i}]`;
      const at = (id: string) => current.get(id);
      const need = (id: string, field: string): Pt | undefined => {
        const p = at(id);
        if (!p) issues.push({ path: `${path}.${field}`, code: "unknown_entity", params: { id } });
        return p;
      };
      const R = PLAYER_RADIUS;

      switch (a.type) {
        case "pass": {
          const from = need(a.from, "from");
          const to = need(a.to, "to");
          if (from && to)
            actions.push({
              action: a,
              step: s,
              points: [from, to],
              startCut: R + 0.05,
              endCut: R + 0.08,
              tbar: false,
            });
          break;
        }
        case "shot": {
          const from = need(a.entity, "entity");
          const to = a.to ? resolvePos(a.to, pack, at, `${path}.to`, issues) : pack.primaryTarget;
          if (from && to)
            actions.push({
              action: a,
              step: s,
              points: [from, to],
              startCut: R + 0.05,
              endCut: 0.35,
              tbar: false,
            });
          break;
        }
        case "cut":
        case "move":
        case "dribble": {
          const from = need(a.entity, "entity");
          if (!from) break;
          const pts: Pt[] = [from];
          let ok = true;
          a.path.forEach((p, j) => {
            const r = resolvePos(p, pack, at, `${path}.path[${j}]`, issues);
            if (r) pts.push(r);
            else ok = false;
          });
          if (!ok) break;
          actions.push({
            action: a,
            step: s,
            points: pts,
            startCut: R + 0.05,
            endCut: 0,
            tbar: false,
          });
          pending.set(a.entity, pts[pts.length - 1]!);
          break;
        }
        case "screen": {
          const from = need(a.entity, "entity");
          const target = resolvePos(a.target, pack, at, `${path}.target`, issues);
          if (!from || !target) break;
          let end = target;
          if ("entity" in a.target) {
            // stop just short of the defender being screened
            const dx = target.x - from.x;
            const dy = target.y - from.y;
            const len = Math.hypot(dx, dy);
            if (len > SCREEN_STANDOFF)
              end = {
                x: target.x - (dx / len) * SCREEN_STANDOFF,
                y: target.y - (dy / len) * SCREEN_STANDOFF,
              };
          }
          actions.push({
            action: a,
            step: s,
            points: [from, end],
            startCut: R + 0.05,
            endCut: 0,
            tbar: true,
          });
          pending.set(a.entity, end);
          break;
        }
      }
    });
    for (const [k, v] of pending) current.set(k, v);
  }

  const annotations: ResolvedAnnotation[] = [];
  d.annotations.forEach((n, i) => {
    const path = `annotations[${i}]`;
    const at = (id: string) => start.get(id);
    if (n.type === "zone_rect") {
      const a = resolvePos(n.from, pack, at, `${path}.from`, issues);
      const b = resolvePos(n.to, pack, at, `${path}.to`, issues);
      if (a && b) annotations.push({ annotation: n, a, b });
    } else if (n.type === "zone_circle") {
      const a = resolvePos(n.center, pack, at, `${path}.center`, issues);
      if (a) annotations.push({ annotation: n, a });
    } else {
      const a = resolvePos(n.at, pack, at, `${path}.at`, issues);
      if (a) annotations.push({ annotation: n, a });
    }
  });

  const entities: ResolvedEntity[] = [];
  for (const e of d.entities) {
    const at = e.type === "ball" ? ballAt.get(e.id) : start.get(e.id);
    if (at) entities.push({ entity: e, at });
  }

  return { resolved: { entities, actions, annotations, steps }, issues };
}
