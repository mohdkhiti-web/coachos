import type { CourtPack, Pt } from "./pack";
import { isCarrier, resolveDiagram, type Issue } from "./resolve";
import { LIMITS, type Diagram, type Entity } from "./schema";

/**
 * Semantic validation on top of the Zod schema (ARCHITECTURE.md §10.4/§14.3): everything a schema
 * alone can't say — references exist, positions are on the court, the sport allows the action, a
 * pass really starts with the ball. Human-authored and (later) AI-generated diagrams share it.
 *
 * Issue codes are i18n keys under `diagram.errors.*`.
 */
export function validateDiagram(d: Diagram, pack: CourtPack): Issue[] {
  const { resolved, issues } = resolveDiagram(d, pack);
  const out: Issue[] = [...issues];
  const byId = new Map<string, Entity>();
  for (const e of d.entities) if (!byId.has(e.id)) byId.set(e.id, e);

  // action ids unique; action allowed by the sport; actors have the right role
  const actionIds = new Set<string>();
  d.actions.forEach((a, i) => {
    if (actionIds.has(a.id))
      out.push({ path: `actions[${i}].id`, code: "duplicate_id", params: { id: a.id } });
    actionIds.add(a.id);
    if (!pack.actions.includes(a.type))
      out.push({
        path: `actions[${i}].type`,
        code: "action_not_allowed",
        params: { type: a.type },
      });

    const actorIds = a.type === "pass" ? [a.from, a.to] : [a.entity];
    for (const id of actorIds) {
      const e = byId.get(id);
      if (e && !isCarrier(e))
        out.push({ path: `actions[${i}]`, code: "invalid_actor", params: { id, type: a.type } });
    }
  });

  // balls
  const balls = d.entities.filter((e) => e.type === "ball");
  if (balls.length > LIMITS.balls) out.push({ path: "entities", code: "too_many_balls" });
  const holders = new Set<string>();
  d.entities.forEach((e, i) => {
    if (e.type !== "ball") return;
    if (Boolean(e.heldBy) === Boolean(e.at))
      out.push({ path: `entities[${i}]`, code: "ball_needs_holder_or_position" });
    if (e.heldBy) {
      if (holders.has(e.heldBy))
        out.push({
          path: `entities[${i}].heldBy`,
          code: "ball_holder_shared",
          params: { id: e.heldBy },
        });
      holders.add(e.heldBy);
    }
  });

  // possession: pass/dribble/shot need the ball; a pass moves it to the receiver at the END of the step
  const has = new Set(holders);
  for (const s of resolved.steps) {
    const received: string[] = [];
    d.actions.forEach((a, i) => {
      if (a.step !== s) return;
      if (a.type === "pass") {
        if (!has.has(a.from))
          out.push({
            path: `actions[${i}]`,
            code: "action_requires_ball",
            params: { id: a.from, type: a.type },
          });
        else {
          has.delete(a.from);
          received.push(a.to);
        }
      } else if (a.type === "dribble" || a.type === "shot") {
        if (!has.has(a.entity))
          out.push({
            path: `actions[${i}]`,
            code: "action_requires_ball",
            params: { id: a.entity, type: a.type },
          });
      }
    });
    for (const r of received) has.add(r);
  }

  // everything must sit on the court (within tolerance)
  const { minX, maxX, minY, maxY } = pack.bounds;
  const t = pack.tolerance;
  const inside = (p: Pt) =>
    p.x >= minX - t && p.x <= maxX + t && p.y >= minY - t && p.y <= maxY + t;
  resolved.entities.forEach(({ entity, at }) => {
    if (!inside(at))
      out.push({ path: `entities.${entity.id}`, code: "out_of_bounds", params: { id: entity.id } });
  });
  resolved.actions.forEach((ra) => {
    if (ra.points.some((p) => !inside(p)))
      out.push({
        path: `actions.${ra.action.id}`,
        code: "out_of_bounds",
        params: { id: ra.action.id },
      });
  });
  resolved.annotations.forEach((ra, i) => {
    if (!inside(ra.a) || (ra.b && !inside(ra.b)))
      out.push({ path: `annotations[${i}]`, code: "out_of_bounds" });
  });

  return dedupe(out);
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.path}|${i.code}|${JSON.stringify(i.params ?? {})}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
