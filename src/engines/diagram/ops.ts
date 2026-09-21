import { z } from "zod";
import type { CourtPack } from "./pack";
import { resolveDiagram } from "./resolve";
import {
  actionSchema,
  diagramSchema,
  LIMITS,
  positionSchema,
  type Action,
  type Annotation,
  type Diagram,
  type DiagramInput,
  type Entity,
  type Position,
} from "./schema";
import { validateDiagram } from "./validate";

/**
 * Diagram OPERATIONS: the small, named edits a coach makes in the editor (move a player, draw a pass, change a role…)
 * and that the AI assistant may ask for. One vocabulary, one implementation, one validation — so a change proposed by a
 * model is exactly as safe as a click: it is a data structure checked against the schema and the court, applied by pure
 * code, never a piece of markup. Pure (no DOM, no framework): everything sport-specific arrives through the CourtPack.
 */

export const MAX_OPS = 40;

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/, { error: "bad_id" });
const label = z.string().trim().min(1).max(LIMITS.label);
const text = z.string().trim().min(1).max(LIMITS.text);
const side = z.enum(["offense", "defense"]);

const step = z.int().min(1).max(LIMITS.steps).optional();
const mover = <T extends "cut" | "move" | "dribble">(type: T) =>
  z.strictObject({
    type: z.literal(type),
    id: id.optional(),
    step,
    entity: id,
    path: z.array(positionSchema).min(1).max(LIMITS.pathPoints),
  });

/** An action as an operation carries it: the same shape as a diagram's action, with the id and step optional. */
const actionInput = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pass"), id: id.optional(), step, from: id, to: id }),
  z.strictObject({
    type: z.literal("shot"),
    id: id.optional(),
    step,
    entity: id,
    to: positionSchema.optional(),
  }),
  mover("cut"),
  mover("move"),
  mover("dribble"),
  z.strictObject({
    type: z.literal("screen"),
    id: id.optional(),
    step,
    entity: id,
    target: positionSchema,
  }),
]);

export const diagramOpSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("add_player"),
    id: id.optional(),
    side,
    label: label.optional(),
    at: positionSchema,
  }),
  z.strictObject({
    op: z.literal("add_coach"),
    id: id.optional(),
    label: label.optional(),
    at: positionSchema,
  }),
  z.strictObject({ op: z.literal("add_cone"), id: id.optional(), at: positionSchema }),
  z.strictObject({
    op: z.literal("add_ball"),
    id: id.optional(),
    heldBy: id.optional(),
    at: positionSchema.optional(),
  }),
  z.strictObject({ op: z.literal("move"), id, to: positionSchema }),
  z.strictObject({ op: z.literal("remove"), id }),
  z.strictObject({ op: z.literal("set_label"), id, label }),
  z.strictObject({ op: z.literal("set_side"), id, side }),
  z.strictObject({ op: z.literal("give_ball"), ball: id, to: id }),
  z.strictObject({ op: z.literal("add_action"), action: actionInput }),
  z.strictObject({ op: z.literal("remove_action"), id }),
  z.strictObject({ op: z.literal("set_step"), id, step: z.int().min(1).max(LIMITS.steps) }),
  z.strictObject({
    op: z.literal("set_path"),
    id,
    path: z.array(positionSchema).min(1).max(LIMITS.pathPoints),
  }),
  z.strictObject({ op: z.literal("add_text"), at: positionSchema, text }),
  z.strictObject({
    op: z.literal("add_zone"),
    from: positionSchema,
    to: positionSchema,
    label: z.string().trim().min(1).max(LIMITS.zoneLabel).optional(),
  }),
  z.strictObject({
    op: z.literal("remove_annotation"),
    index: z.int().min(0).max(LIMITS.annotations),
  }),
  z.strictObject({ op: z.literal("duplicate"), id }),
  z.strictObject({ op: z.literal("clear_actions") }),
  z.strictObject({ op: z.literal("set_court"), court: z.enum(["half", "full"]) }),
]);
export type DiagramOp = z.output<typeof diagramOpSchema>;

export const diagramOpsSchema = z.array(diagramOpSchema).min(1).max(MAX_OPS);

export type OpsResult =
  | { ok: true; diagram: Diagram }
  | {
      ok: false;
      issues: Array<{ path: string; code: string; params?: Record<string, string | number> }>;
    };

export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; i < 1000; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
  return `${prefix}${used.size + 1}`;
}

const round = (n: number) => Math.round(n * 100) / 100;
const refsEntity = (p: Position | undefined, entityId: string) =>
  !!p && "entity" in p && p.entity === entityId;

/**
 * Remove an entity and everything that depends on it: actions it takes part in, a ball it holds
 * becomes loose where it lay, and positions defined relative to it are frozen to where it stood.
 */
export function removeEntity(d: DiagramInput, entityId: string, pack: CourtPack): DiagramInput {
  const resolved = resolveDiagram(d as Diagram, pack).resolved.entities;
  const where = resolved.find((r) => r.entity.id === entityId)?.at;
  const freeze = (p: Position): Position => {
    if (!refsEntity(p, entityId)) return p;
    const off = (p as { offset?: [number, number] }).offset ?? [0, 0];
    return where
      ? { x: round(where.x + off[0]), y: round(where.y + off[1]) }
      : { anchor: Object.keys(pack.anchors)[0] ?? "basket" };
  };

  const entities = d.entities
    .filter((e) => e.id !== entityId)
    .map((e) => {
      if (e.type === "ball" && e.heldBy === entityId) {
        const ball = resolved.find((r) => r.entity.id === e.id)?.at;
        return {
          id: e.id,
          type: "ball",
          at: ball ? { x: round(ball.x), y: round(ball.y) } : { anchor: "basket" },
        } as Entity;
      }
      return "at" in e && e.at ? ({ ...e, at: freeze(e.at) } as Entity) : e;
    });

  const involves = (a: NonNullable<DiagramInput["actions"]>[number]) =>
    a.type === "pass" ? a.from === entityId || a.to === entityId : a.entity === entityId;
  const actions = (d.actions ?? [])
    .filter((a) => !involves(a))
    .map((a) => {
      if (a.type === "screen") return { ...a, target: freeze(a.target) };
      if (a.type === "shot") return a.to ? { ...a, to: freeze(a.to) } : a;
      if (a.type === "cut" || a.type === "move" || a.type === "dribble")
        return { ...a, path: a.path.map(freeze) };
      return a;
    });

  const annotations = (d.annotations ?? []).map((n) => {
    if (n.type === "text") return { ...n, at: freeze(n.at) };
    if (n.type === "zone_rect") return { ...n, from: freeze(n.from), to: freeze(n.to) };
    return { ...n, center: freeze(n.center) };
  });
  return { ...d, entities, actions, annotations } as DiagramInput;
}

const PREFIX = { offense: "o", defense: "x", coach: "c", cone: "k", ball: "b" } as const;

function defaultLabel(entities: readonly Entity[], side: "offense" | "defense"): string {
  const n = entities.filter((e) => e.type === "player" && e.side === side).length + 1;
  return side === "offense" ? String(Math.min(n, 9)) : `X${Math.min(n, 9)}`;
}

/** A copy of an entity's position, moved a little so the two do not sit on one spot. */
function nudged(p: Position): Position {
  if ("x" in p) return { x: round(p.x + 0.9), y: round(p.y + 0.9) };
  const o = p.offset ?? [0, 0];
  const offset: [number, number] = [
    Math.max(-10, Math.min(10, round(o[0] + 0.9))),
    Math.max(-10, Math.min(10, round(o[1] + 0.9))),
  ];
  return "anchor" in p ? { anchor: p.anchor, offset } : { entity: p.entity, offset };
}

function nextStep(d: DiagramInput): number {
  return Math.min(LIMITS.steps, Math.max(1, ...(d.actions ?? []).map((a) => a.step ?? 1)));
}

/** Apply ONE operation. Throws `OpError` (caught by `applyOps`) for a reference that does not exist. */
class OpError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

function applyOne(d: DiagramInput, op: DiagramOp, pack: CourtPack): DiagramInput {
  const entity = (entityId: string) => {
    const e = d.entities.find((x) => x.id === entityId);
    if (!e) throw new OpError("unknown_entity", { id: entityId });
    return e;
  };
  const taken = (extra: Iterable<string> = []) => [
    ...d.entities.map((e) => e.id),
    ...(d.actions ?? []).map((a) => a.id),
    ...extra,
  ];
  const withEntity = (e: Entity): DiagramInput => ({ ...d, entities: [...d.entities, e] });
  const freshId = (wanted: string | undefined, prefix: string) => {
    if (wanted) {
      if (taken().includes(wanted)) throw new OpError("duplicate_id", { id: wanted });
      return wanted;
    }
    return nextId(prefix, taken());
  };

  switch (op.op) {
    case "add_player": {
      const e: Entity = {
        id: freshId(op.id, PREFIX[op.side]),
        type: "player",
        side: op.side,
        label: op.label ?? defaultLabel(d.entities, op.side),
        at: op.at,
      };
      return withEntity(e);
    }
    case "add_coach":
      return withEntity({
        id: freshId(op.id, PREFIX.coach),
        type: "coach",
        ...(op.label ? { label: op.label } : {}),
        at: op.at,
      });
    case "add_cone":
      return withEntity({ id: freshId(op.id, PREFIX.cone), type: "cone", at: op.at });
    case "add_ball": {
      if (Boolean(op.heldBy) === Boolean(op.at)) throw new OpError("ball_needs_holder_or_position");
      if (op.heldBy) entity(op.heldBy);
      return withEntity({
        id: freshId(op.id, PREFIX.ball),
        type: "ball",
        ...(op.heldBy ? { heldBy: op.heldBy } : { at: op.at }),
      } as Entity);
    }
    case "move": {
      const target = entity(op.id);
      if (target.type === "ball") {
        if (target.heldBy) throw new OpError("ball_is_held", { id: op.id });
        return {
          ...d,
          entities: d.entities.map((e) => (e.id === op.id ? { ...e, at: op.to } : e)) as Entity[],
        };
      }
      return {
        ...d,
        entities: d.entities.map((e) => (e.id === op.id ? { ...e, at: op.to } : e)) as Entity[],
      };
    }
    case "remove":
      entity(op.id);
      return removeEntity(d, op.id, pack);
    case "set_label": {
      const target = entity(op.id);
      if (target.type !== "player" && target.type !== "coach" && target.type !== "marker")
        throw new OpError("no_label", { id: op.id });
      return {
        ...d,
        entities: d.entities.map((e) =>
          e.id === op.id ? { ...e, label: op.label } : e,
        ) as Entity[],
      };
    }
    case "set_side": {
      const target = entity(op.id);
      if (target.type !== "player") throw new OpError("not_a_player", { id: op.id });
      return {
        ...d,
        entities: d.entities.map((e) => (e.id === op.id ? { ...e, side: op.side } : e)) as Entity[],
      };
    }
    case "give_ball": {
      const ball = entity(op.ball);
      if (ball.type !== "ball") throw new OpError("not_a_ball", { id: op.ball });
      const holder = entity(op.to);
      if (holder.type !== "player" && holder.type !== "coach")
        throw new OpError("invalid_actor", { id: op.to, type: "ball" });
      return {
        ...d,
        entities: d.entities.map((e) => {
          if (e.type !== "ball") return e;
          if (e.id === op.ball) return { id: e.id, type: "ball", heldBy: op.to } as Entity;
          // a ball already held by the new holder is put down where it was
          if (e.heldBy === op.to) {
            const at = resolveDiagram(d as Diagram, pack).resolved.entities.find(
              (r) => r.entity.id === e.id,
            )?.at;
            return {
              id: e.id,
              type: "ball",
              at: at ? { x: round(at.x), y: round(at.y) } : { anchor: "basket" },
            } as Entity;
          }
          return e;
        }),
      };
    }
    case "add_action": {
      const a = op.action as Record<string, unknown> & { type: Action["type"] };
      const actionId = freshId(a.id as string | undefined, "a");
      const action = {
        ...a,
        id: actionId,
        step: (a.step as number | undefined) ?? nextStep(d),
      } as Action;
      const parsed = actionSchema.safeParse(action);
      if (!parsed.success) throw new OpError("action_invalid");
      return { ...d, actions: [...(d.actions ?? []), parsed.data] };
    }
    case "remove_action": {
      if (!(d.actions ?? []).some((a) => a.id === op.id))
        throw new OpError("unknown_action", { id: op.id });
      return { ...d, actions: (d.actions ?? []).filter((a) => a.id !== op.id) };
    }
    case "set_step": {
      if (!(d.actions ?? []).some((a) => a.id === op.id))
        throw new OpError("unknown_action", { id: op.id });
      return {
        ...d,
        actions: (d.actions ?? []).map((a) =>
          a.id === op.id ? { ...a, step: op.step } : a,
        ) as Action[],
      };
    }
    case "set_path": {
      const current = (d.actions ?? []).find((a) => a.id === op.id);
      if (!current) throw new OpError("unknown_action", { id: op.id });
      if (current.type !== "cut" && current.type !== "move" && current.type !== "dribble")
        throw new OpError("no_path", { id: op.id });
      return {
        ...d,
        actions: (d.actions ?? []).map((a) =>
          a.id === op.id ? { ...a, path: op.path } : a,
        ) as Action[],
      };
    }
    case "add_text":
      return {
        ...d,
        annotations: [
          ...(d.annotations ?? []),
          { type: "text", at: op.at, text: op.text } as Annotation,
        ],
      };
    case "add_zone":
      return {
        ...d,
        annotations: [
          ...(d.annotations ?? []),
          {
            type: "zone_rect",
            from: op.from,
            to: op.to,
            ...(op.label ? { label: op.label } : {}),
          } as Annotation,
        ],
      };
    case "remove_annotation": {
      const list = d.annotations ?? [];
      if (op.index >= list.length) throw new OpError("unknown_annotation", { index: op.index });
      return { ...d, annotations: list.filter((_, i) => i !== op.index) };
    }
    case "duplicate": {
      const source = entity(op.id);
      if (source.type === "ball") throw new OpError("no_duplicate_ball", { id: op.id });
      const prefix =
        source.type === "player"
          ? PREFIX[source.side]
          : source.type === "coach"
            ? "c"
            : source.type === "cone"
              ? "k"
              : "m";
      const copy = { ...source, id: nextId(prefix, taken()), at: nudged(source.at) } as Entity;
      if (copy.type === "player") copy.label = defaultLabel(d.entities, copy.side);
      return withEntity(copy);
    }
    case "clear_actions":
      return { ...d, actions: [] };
    case "set_court":
      return { ...d, court: { ...d.court, type: op.court } };
  }
}

/**
 * Apply operations in order to a diagram, then check the WHOLE result: the schema, then everything the court and the
 * sport's rules say (references exist, positions are on the court, a pass starts with the ball). Nothing is returned
 * unless it is a valid diagram — an invalid batch changes nothing.
 */
export function applyOps(
  diagram: DiagramInput,
  ops: readonly DiagramOp[],
  pack: CourtPack,
  packFor?: (court: Diagram["court"]) => CourtPack | undefined,
): OpsResult {
  let current = diagram;
  try {
    for (const op of ops)
      current = applyOne(current, op, packFor ? (packFor(current.court) ?? pack) : pack);
  } catch (err) {
    if (err instanceof OpError)
      return { ok: false, issues: [{ path: "ops", code: err.code, params: err.params }] };
    throw err;
  }
  const parsed = diagramSchema.safeParse(current);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: "schema",
        params: { message: i.message },
      })),
    };
  const finalPack = packFor ? (packFor(parsed.data.court) ?? pack) : pack;
  const issues = validateDiagram(parsed.data, finalPack);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, diagram: parsed.data };
}
