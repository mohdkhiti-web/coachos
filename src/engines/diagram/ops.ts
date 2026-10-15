import { z } from "zod";
import type { CourtPack } from "./pack";
import { isMover, resolveDiagram } from "./resolve";
import {
  actionSchema,
  annotationSchema,
  CONE_VARIANTS,
  DEFEND_KINDS,
  DIAGRAM_COLORS,
  diagramSchema,
  entitySchema,
  EQUIPMENT_KINDS,
  LIMITS,
  lookShape,
  MARK_KINDS,
  PASS_KINDS,
  positionSchema,
  SCREEN_KINDS,
  strokeShape,
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
const color = z.enum(DIAGRAM_COLORS);
const path = z.array(positionSchema).min(1).max(LIMITS.pathPoints);
const delta = z.number().finite().min(-60).max(60);
const stepNo = z.int().min(1).max(LIMITS.steps);

const step = stepNo.optional();
const mover = <T extends "cut" | "move" | "dribble" | "sprint">(type: T) =>
  z.strictObject({
    type: z.literal(type),
    id: id.optional(),
    step,
    entity: id,
    path,
    ...strokeShape,
  });

/** An action as an operation carries it: the same shape as a diagram's action, with the id and step optional. */
const actionInput = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("pass"),
    id: id.optional(),
    step,
    from: id,
    to: id,
    kind: z.enum(PASS_KINDS).optional(),
    ...strokeShape,
  }),
  z.strictObject({
    type: z.literal("shot"),
    id: id.optional(),
    step,
    entity: id,
    to: positionSchema.optional(),
    ...strokeShape,
  }),
  mover("cut"),
  mover("move"),
  mover("dribble"),
  mover("sprint"),
  z.strictObject({
    type: z.literal("defend"),
    id: id.optional(),
    step,
    kind: z.enum(DEFEND_KINDS),
    entity: id,
    path,
    ...strokeShape,
  }),
  z.strictObject({
    type: z.literal("screen"),
    id: id.optional(),
    step,
    entity: id,
    target: positionSchema,
    kind: z.enum(SCREEN_KINDS).optional(),
    ...strokeShape,
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
  z.strictObject({
    op: z.literal("add_cone"),
    id: id.optional(),
    at: positionSchema,
    variant: z.enum(CONE_VARIANTS).optional(),
    label: label.optional(),
    ...lookShape,
  }),
  z.strictObject({
    op: z.literal("add_equipment"),
    id: id.optional(),
    kind: z.enum(EQUIPMENT_KINDS),
    at: positionSchema,
    label: label.optional(),
    ...lookShape,
  }),
  z.strictObject({
    op: z.literal("add_ball"),
    id: id.optional(),
    heldBy: id.optional(),
    at: positionSchema.optional(),
  }),
  z.strictObject({ op: z.literal("move"), id, to: positionSchema }),
  /** Move several objects by the same amount (a whole selection dragged at once). Held balls travel with their holder. */
  z.strictObject({
    op: z.literal("move_by"),
    ids: z.array(id).min(1).max(LIMITS.entities),
    dx: delta,
    dy: delta,
  }),
  z.strictObject({ op: z.literal("remove"), id }),
  z.strictObject({ op: z.literal("set_label"), id, label }),
  z.strictObject({ op: z.literal("set_side"), id, side }),
  /**
   * Turn, scale or colour objects (one or many). A property an object does not have (a cone has no side; a ball has no
   * rotation) is skipped for it, so one call can style a mixed selection. `null` clears a colour or a variant.
   */
  z.strictObject({
    op: z.literal("set_props"),
    ids: z.array(id).min(1).max(LIMITS.entities),
    rotation: z.int().min(-180).max(180).optional(),
    scale: z.number().finite().min(0.5).max(3).optional(),
    color: color.nullable().optional(),
    variant: z.enum(CONE_VARIANTS).optional(),
  }),
  z.strictObject({ op: z.literal("give_ball"), ball: id, to: id }),
  /** Put a held ball down where it is, or at a position. */
  z.strictObject({ op: z.literal("release_ball"), ball: id, at: positionSchema.optional() }),
  z.strictObject({ op: z.literal("add_action"), action: actionInput }),
  z.strictObject({ op: z.literal("remove_action"), id }),
  z.strictObject({ op: z.literal("set_step"), id, step: stepNo }),
  z.strictObject({ op: z.literal("set_path"), id, path }),
  /** Change how an action is drawn or where it ends. `null` clears an optional style. */
  z.strictObject({
    op: z.literal("set_action"),
    id,
    kind: z.string().max(12).optional(),
    curve: z.number().finite().min(-1).max(1).nullable().optional(),
    weight: z.enum(["thin", "normal", "thick"]).nullable().optional(),
    color: color.nullable().optional(),
    to: positionSchema.optional(),
    target: positionSchema.optional(),
  }),
  z.strictObject({
    op: z.literal("add_text"),
    at: positionSchema,
    text,
    color: color.optional(),
  }),
  z.strictObject({
    op: z.literal("add_zone"),
    from: positionSchema,
    to: positionSchema,
    label: z.string().trim().min(1).max(LIMITS.zoneLabel).optional(),
    color: color.optional(),
  }),
  z.strictObject({
    op: z.literal("add_circle"),
    center: positionSchema,
    radius: z.number().finite().min(0.5).max(10),
    label: z.string().trim().min(1).max(LIMITS.zoneLabel).optional(),
    color: color.optional(),
  }),
  z.strictObject({
    op: z.literal("add_mark"),
    kind: z.enum(MARK_KINDS),
    at: positionSchema,
    color: color.optional(),
  }),
  z.strictObject({
    op: z.literal("add_freehand"),
    points: z
      .array(
        z.strictObject({
          x: z.number().finite().min(-60).max(60),
          y: z.number().finite().min(-60).max(60),
        }),
      )
      .min(2)
      .max(LIMITS.freehandPoints),
    color: color.optional(),
  }),
  z.strictObject({
    op: z.literal("remove_annotation"),
    index: z.int().min(0).max(LIMITS.annotations),
  }),
  z.strictObject({
    op: z.literal("move_annotation"),
    index: z.int().min(0).max(LIMITS.annotations),
    dx: delta,
    dy: delta,
  }),
  z.strictObject({
    op: z.literal("set_annotation"),
    index: z.int().min(0).max(LIMITS.annotations),
    text: text.optional(),
    label: z.string().trim().min(1).max(LIMITS.zoneLabel).nullable().optional(),
    color: color.nullable().optional(),
  }),
  z.strictObject({ op: z.literal("duplicate"), id }),
  /**
   * Copy a group of objects into the drawing: new ids, everything that points at a copied object re-pointed at its copy,
   * the lot shifted by (dx, dy). This is copy/paste and "duplicate the selection".
   */
  z.strictObject({
    op: z.literal("paste"),
    entities: z.array(entitySchema).max(LIMITS.entities),
    actions: z.array(actionSchema).max(LIMITS.actions).default([]),
    annotations: z.array(annotationSchema).max(LIMITS.annotations).default([]),
    dx: delta.default(0),
    dy: delta.default(0),
  }),
  z.strictObject({ op: z.literal("clear_actions") }),
  /** `half_far` is the half court around the far basket (the full court's other end). */
  z.strictObject({ op: z.literal("set_court"), court: z.enum(["half", "full", "half_far"]) }),
  // steps: a step is a stretch of the drill that starts where the previous one left everyone standing
  z.strictObject({ op: z.literal("add_step") }),
  z.strictObject({ op: z.literal("duplicate_step"), step: stepNo }),
  z.strictObject({ op: z.literal("remove_step"), step: stepNo }),
  z.strictObject({ op: z.literal("move_step"), step: stepNo, to: stepNo }),
  z.strictObject({
    op: z.literal("set_step_title"),
    step: stepNo,
    title: z.string().trim().min(1).max(LIMITS.stepTitle).nullable(),
  }),
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

/** How many steps the drill has: what it says, or as many as its actions use (at least one). */
export function stepCountOf(d: Pick<DiagramInput, "actions" | "stepCount">): number {
  return Math.max(d.stepCount ?? 1, ...(d.actions ?? []).map((a) => a.step ?? 1));
}

const round = (n: number) => Math.round(n * 100) / 100;
const clampOffset = (n: number) => Math.max(-10, Math.min(10, round(n)));
const refsEntity = (p: Position | undefined, entityId: string) =>
  !!p && "entity" in p && p.entity === entityId;

type AnyAction = NonNullable<DiagramInput["actions"]>[number];

/** Every position an action carries, as [where, replace] so a caller can rewrite them all the same way. */
function mapActionPositions(a: AnyAction, fn: (p: Position) => Position): AnyAction {
  if (a.type === "screen") return { ...a, target: fn(a.target) };
  if (a.type === "shot") return a.to ? { ...a, to: fn(a.to) } : a;
  if (a.type === "pass") return a;
  return { ...a, path: a.path.map(fn) } as AnyAction;
}

function mapAnnotationPositions(n: Annotation, fn: (p: Position) => Position): Annotation {
  switch (n.type) {
    case "text":
    case "mark":
      return { ...n, at: fn(n.at) };
    case "zone_rect":
      return { ...n, from: fn(n.from), to: fn(n.to) };
    case "zone_circle":
      return { ...n, center: fn(n.center) };
    case "freehand":
      return n;
  }
}

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
          ...(e.scale ? { scale: e.scale } : {}),
          at: ball ? { x: round(ball.x), y: round(ball.y) } : { anchor: "basket" },
        } as Entity;
      }
      return "at" in e && e.at ? ({ ...e, at: freeze(e.at) } as Entity) : e;
    });

  const involves = (a: AnyAction) =>
    a.type === "pass" ? a.from === entityId || a.to === entityId : a.entity === entityId;
  const actions = (d.actions ?? [])
    .filter((a) => !involves(a))
    .map((a) => mapActionPositions(a, freeze));
  const annotations = (d.annotations ?? []).map((n) => mapAnnotationPositions(n, freeze));
  return { ...d, entities, actions, annotations } as DiagramInput;
}

const PREFIX = {
  offense: "o",
  defense: "x",
  coach: "c",
  cone: "k",
  ball: "b",
  equipment: "e",
  marker: "m",
} as const;

const prefixOf = (e: Entity): string =>
  e.type === "player" ? PREFIX[e.side] : PREFIX[e.type as keyof typeof PREFIX];

function defaultLabel(entities: readonly Entity[], sideOf: "offense" | "defense"): string {
  const n = entities.filter((e) => e.type === "player" && e.side === sideOf).length + 1;
  return sideOf === "offense" ? String(Math.min(n, 9)) : `X${Math.min(n, 9)}`;
}

/** A copy of an entity's position, moved a little so the two do not sit on one spot. */
function nudged(p: Position): Position {
  if ("x" in p) return { x: round(p.x + 0.9), y: round(p.y + 0.9) };
  const o = p.offset ?? [0, 0];
  const offset: [number, number] = [clampOffset(o[0] + 0.9), clampOffset(o[1] + 0.9)];
  return "anchor" in p ? { anchor: p.anchor, offset } : { entity: p.entity, offset };
}

/** A position shifted by (dx, dy). Anchors become plain coordinates; a reference into `keep` moves with what it points at. */
function shifted(
  p: Position,
  dx: number,
  dy: number,
  pack: CourtPack,
  keep?: ReadonlySet<string>,
): Position {
  if ("x" in p) return { x: round(p.x + dx), y: round(p.y + dy) };
  if ("entity" in p) {
    if (keep?.has(p.entity)) return p;
    const o = p.offset ?? [0, 0];
    return { entity: p.entity, offset: [clampOffset(o[0] + dx), clampOffset(o[1] + dy)] };
  }
  const a = pack.anchors[p.anchor];
  if (!a) return p;
  const o = p.offset ?? [0, 0];
  return { x: round(a.x + o[0] + dx), y: round(a.y + o[1] + dy) };
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

type PackFor = (court: Diagram["court"]) => CourtPack | undefined;

/** Turn a whole drawing half a turn (the near half court ↔ the far one): x flips, y is mirrored about the pair of courts. */
function rotateHalfTurn(d: DiagramInput, sumY: number, pack: CourtPack): DiagramInput {
  const flip = (p: Position): Position => {
    if ("x" in p) return { x: round(-p.x), y: round(sumY - p.y) };
    const o = p.offset;
    const offset = o ? ([round(-o[0]), round(-o[1])] as [number, number]) : undefined;
    void pack;
    return "anchor" in p
      ? { anchor: p.anchor, ...(offset ? { offset } : {}) }
      : { entity: p.entity, ...(offset ? { offset } : {}) };
  };
  const turn = (r: number | undefined) =>
    r === undefined ? undefined : ((((r + 180 + 180) % 360) + 360) % 360) - 180;
  return {
    ...d,
    entities: d.entities.map((e) => {
      const rotation = "rotation" in e ? turn(e.rotation) : undefined;
      const base = "at" in e && e.at ? { ...e, at: flip(e.at) } : e;
      return (rotation !== undefined ? { ...base, rotation } : base) as Entity;
    }),
    actions: (d.actions ?? []).map((a) => mapActionPositions(a, flip)),
    annotations: (d.annotations ?? []).map((n) =>
      n.type === "freehand"
        ? { ...n, points: n.points.map((p) => ({ x: round(-p.x), y: round(sumY - p.y) })) }
        : mapAnnotationPositions(n, flip),
    ),
  };
}

const isFar = (c: { variant: string }) => c.variant.endsWith("_far");
const nearVariant = (v: string) => (v.endsWith("_far") ? v.slice(0, -4) : v);

function applyOne(
  d: DiagramInput,
  op: DiagramOp,
  pack: CourtPack,
  packFor?: PackFor,
): DiagramInput {
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
  const optional = <T extends Record<string, unknown>>(o: T): Partial<T> =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
  const mapEntity = (entityId: string, fn: (e: Entity) => Entity): DiagramInput => ({
    ...d,
    entities: d.entities.map((e) => (e.id === entityId ? fn(e) : e)),
  });
  const annotationAt = (index: number) => {
    const list = d.annotations ?? [];
    const found = list[index];
    if (!found) throw new OpError("unknown_annotation", { index });
    return { list, found };
  };
  const setStepNumbers = (fn: (n: number) => number | null): DiagramInput => {
    const titles = Object.fromEntries(
      Object.entries(d.stepTitles ?? {}).flatMap(([k, v]) => {
        const to = fn(Number(k));
        return to === null ? [] : [[String(to), v]];
      }),
    );
    return {
      ...d,
      actions: (d.actions ?? []).flatMap((a) => {
        const to = fn(a.step ?? 1);
        return to === null ? [] : [{ ...a, step: to } as AnyAction];
      }),
      ...(Object.keys(titles).length ? { stepTitles: titles } : { stepTitles: undefined }),
    };
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
      return withEntity({
        id: freshId(op.id, PREFIX.cone),
        type: "cone",
        ...optional({
          variant: op.variant,
          label: op.label,
          rotation: op.rotation || undefined,
          scale: op.scale === 1 ? undefined : op.scale,
          color: op.color,
        }),
        at: op.at,
      } as Entity);
    case "add_equipment":
      return withEntity({
        id: freshId(op.id, PREFIX.equipment),
        type: "equipment",
        kind: op.kind,
        ...optional({
          label: op.label,
          rotation: op.rotation || undefined,
          scale: op.scale === 1 ? undefined : op.scale,
          color: op.color,
        }),
        at: op.at,
      } as Entity);
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
      if (target.type === "ball" && target.heldBy) throw new OpError("ball_is_held", { id: op.id });
      return mapEntity(op.id, (e) => ({ ...e, at: op.to }) as Entity);
    }
    case "move_by": {
      const at = new Map(
        resolveDiagram(d as Diagram, pack).resolved.entities.map(
          (r) => [r.entity.id, r.at] as const,
        ),
      );
      const moving = new Set(op.ids);
      for (const entityId of op.ids) entity(entityId);
      return {
        ...d,
        entities: d.entities.map((e) => {
          if (!moving.has(e.id)) return e;
          if (e.type === "ball" && e.heldBy) return e; // it rides with its holder
          const from = at.get(e.id);
          if (!from) return e;
          return { ...e, at: { x: round(from.x + op.dx), y: round(from.y + op.dy) } } as Entity;
        }),
      };
    }
    case "remove":
      entity(op.id);
      return removeEntity(d, op.id, pack);
    case "set_label": {
      const target = entity(op.id);
      if (!["player", "coach", "marker", "cone", "equipment"].includes(target.type))
        throw new OpError("no_label", { id: op.id });
      return mapEntity(op.id, (e) => ({ ...e, label: op.label }) as Entity);
    }
    case "set_side": {
      const target = entity(op.id);
      if (target.type !== "player") throw new OpError("not_a_player", { id: op.id });
      return mapEntity(op.id, (e) => ({ ...e, side: op.side }) as Entity);
    }
    case "set_props": {
      for (const entityId of op.ids) entity(entityId);
      const wanted = new Set(op.ids);
      return {
        ...d,
        entities: d.entities.map((e) => {
          if (!wanted.has(e.id)) return e;
          const next: Record<string, unknown> = { ...e };
          const set = (key: string, value: unknown, empty: boolean) => {
            if (empty) delete next[key];
            else next[key] = value;
          };
          const turnable = e.type !== "ball";
          const colourable = e.type !== "ball";
          if (op.rotation !== undefined && turnable)
            set("rotation", op.rotation, op.rotation === 0);
          if (op.scale !== undefined) set("scale", op.scale, op.scale === 1);
          if (op.color !== undefined && colourable) set("color", op.color, op.color === null);
          if (op.variant !== undefined && e.type === "cone") next.variant = op.variant;
          return next as Entity;
        }),
      };
    }
    case "give_ball": {
      const ball = entity(op.ball);
      if (ball.type !== "ball") throw new OpError("not_a_ball", { id: op.ball });
      const holder = entity(op.to);
      if (holder.type !== "player" && holder.type !== "coach")
        throw new OpError("invalid_actor", { id: op.to, type: "ball" });
      const resolved = resolveDiagram(d as Diagram, pack).resolved.entities;
      return {
        ...d,
        entities: d.entities.map((e) => {
          if (e.type !== "ball") return e;
          if (e.id === op.ball) return { id: e.id, type: "ball", heldBy: op.to } as Entity;
          // a ball already held by the new holder is put down where it was
          if (e.heldBy === op.to) {
            const at = resolved.find((r) => r.entity.id === e.id)?.at;
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
    case "release_ball": {
      const ball = entity(op.ball);
      if (ball.type !== "ball") throw new OpError("not_a_ball", { id: op.ball });
      const here = resolveDiagram(d as Diagram, pack).resolved.entities.find(
        (r) => r.entity.id === op.ball,
      )?.at;
      const at: Position =
        op.at ?? (here ? { x: round(here.x), y: round(here.y) } : { anchor: "basket" });
      return mapEntity(
        op.ball,
        (e) =>
          ({
            id: e.id,
            type: "ball",
            ...(e.type === "ball" && e.scale ? { scale: e.scale } : {}),
            at,
          }) as Entity,
      );
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
      if (!isMover(current as Action)) throw new OpError("no_path", { id: op.id });
      return {
        ...d,
        actions: (d.actions ?? []).map((a) =>
          a.id === op.id ? { ...a, path: op.path } : a,
        ) as Action[],
      };
    }
    case "set_action": {
      const current = (d.actions ?? []).find((a) => a.id === op.id);
      if (!current) throw new OpError("unknown_action", { id: op.id });
      const next: Record<string, unknown> = { ...current };
      for (const key of ["curve", "weight", "color"] as const) {
        const value = op[key];
        if (value === undefined) continue;
        if (value === null || (key === "curve" && value === 0)) delete next[key];
        else next[key] = value;
      }
      if (op.kind !== undefined) {
        if (!["pass", "screen", "defend"].includes(current.type))
          throw new OpError("action_invalid");
        next.kind = op.kind;
      }
      if (op.to !== undefined) {
        if (current.type !== "shot") throw new OpError("action_invalid");
        next.to = op.to;
      }
      if (op.target !== undefined) {
        if (current.type !== "screen") throw new OpError("action_invalid");
        next.target = op.target;
      }
      const parsed = actionSchema.safeParse(next);
      if (!parsed.success) throw new OpError("action_invalid");
      return {
        ...d,
        actions: (d.actions ?? []).map((a) => (a.id === op.id ? parsed.data : a)),
      };
    }
    case "add_text":
      return {
        ...d,
        annotations: [
          ...(d.annotations ?? []),
          {
            type: "text",
            at: op.at,
            text: op.text,
            ...optional({ color: op.color }),
          } as Annotation,
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
            ...optional({ label: op.label, color: op.color }),
          } as Annotation,
        ],
      };
    case "add_circle":
      return {
        ...d,
        annotations: [
          ...(d.annotations ?? []),
          {
            type: "zone_circle",
            center: op.center,
            radius: op.radius,
            ...optional({ label: op.label, color: op.color }),
          } as Annotation,
        ],
      };
    case "add_mark":
      return {
        ...d,
        annotations: [
          ...(d.annotations ?? []),
          {
            type: "mark",
            kind: op.kind,
            at: op.at,
            ...optional({ color: op.color }),
          } as Annotation,
        ],
      };
    case "add_freehand":
      return {
        ...d,
        annotations: [
          ...(d.annotations ?? []),
          {
            type: "freehand",
            points: op.points.map((p) => ({ x: round(p.x), y: round(p.y) })),
            ...optional({ color: op.color }),
          } as Annotation,
        ],
      };
    case "remove_annotation": {
      const { list } = annotationAt(op.index);
      return { ...d, annotations: list.filter((_, i) => i !== op.index) };
    }
    case "move_annotation": {
      const { list, found } = annotationAt(op.index);
      const moved: Annotation =
        found.type === "freehand"
          ? {
              ...found,
              points: found.points.map((p) => ({ x: round(p.x + op.dx), y: round(p.y + op.dy) })),
            }
          : mapAnnotationPositions(found, (p) => shifted(p, op.dx, op.dy, pack));
      return { ...d, annotations: list.map((n, i) => (i === op.index ? moved : n)) };
    }
    case "set_annotation": {
      const { list, found } = annotationAt(op.index);
      const next: Record<string, unknown> = { ...found };
      if (op.text !== undefined) {
        if (found.type !== "text") throw new OpError("action_invalid");
        next.text = op.text;
      }
      if (op.label !== undefined) {
        if (found.type !== "zone_rect" && found.type !== "zone_circle")
          throw new OpError("action_invalid");
        if (op.label === null) delete next.label;
        else next.label = op.label;
      }
      if (op.color !== undefined) {
        if (op.color === null) delete next.color;
        else next.color = op.color;
      }
      return { ...d, annotations: list.map((n, i) => (i === op.index ? (next as Annotation) : n)) };
    }
    case "duplicate": {
      const source = entity(op.id);
      const newId = nextId(prefixOf(source), taken());
      if (source.type === "ball") {
        // a copy of a ball is a loose ball beside the original
        const here = resolveDiagram(d as Diagram, pack).resolved.entities.find(
          (r) => r.entity.id === source.id,
        )?.at;
        const at = here ? { x: round(here.x + 0.9), y: round(here.y + 0.9) } : { anchor: "basket" };
        return withEntity({
          id: newId,
          type: "ball",
          at,
          ...(source.scale ? { scale: source.scale } : {}),
        } as Entity);
      }
      const copy = { ...source, id: newId, at: nudged(source.at) } as Entity;
      if (copy.type === "player") copy.label = defaultLabel(d.entities, copy.side);
      return withEntity(copy);
    }
    case "paste": {
      const fragmentIds = new Set(op.entities.map((e) => e.id));
      const used = new Set(taken());
      const rename = new Map<string, string>();
      for (const e of op.entities) {
        const fresh = nextId(prefixOf(e), used);
        used.add(fresh);
        rename.set(e.id, fresh);
      }
      const at = new Map(
        resolveDiagram(d as Diagram, pack).resolved.entities.map(
          (r) => [r.entity.id, r.at] as const,
        ),
      );
      const relink = (p: Position): Position => {
        const moved = shifted(p, op.dx, op.dy, pack, fragmentIds);
        return "entity" in moved && rename.has(moved.entity)
          ? { ...moved, entity: rename.get(moved.entity)! }
          : moved;
      };
      const sameCount = (sideOf: "offense" | "defense") =>
        d.entities.filter((e) => e.type === "player" && e.side === sideOf).length;
      let offense = sameCount("offense");
      let defense = sameCount("defense");
      const copies: Entity[] = op.entities.map((e) => {
        const newId = rename.get(e.id)!;
        if (e.type === "ball") {
          const holder = e.heldBy;
          if (holder && rename.has(holder))
            return { ...e, id: newId, heldBy: rename.get(holder)! } as Entity;
          const from = e.heldBy ? at.get(e.id) : undefined;
          const place: Position = e.at
            ? relink(e.at)
            : from
              ? { x: round(from.x + op.dx), y: round(from.y + op.dy) }
              : { anchor: "basket" };
          const { heldBy: _held, at: _at, ...rest } = e;
          void _held;
          void _at;
          return { ...rest, id: newId, at: place } as Entity;
        }
        const moved = { ...e, id: newId, at: relink(e.at) } as Entity;
        if (moved.type === "player") {
          const n = moved.side === "offense" ? ++offense : ++defense;
          moved.label = moved.side === "offense" ? String(Math.min(n, 9)) : `X${Math.min(n, 9)}`;
        }
        return moved;
      });
      const actionIds = new Set(taken(rename.values()));
      const copiedActions: AnyAction[] = op.actions.flatMap((a) => {
        const involved = a.type === "pass" ? [a.from, a.to] : [a.entity];
        // an action is copied only together with everyone it is about
        if (!involved.every((x) => rename.has(x) || d.entities.some((e) => e.id === x))) return [];
        if (!involved.some((x) => rename.has(x))) return [];
        const fresh = nextId("a", actionIds);
        actionIds.add(fresh);
        const map = (x: string) => rename.get(x) ?? x;
        const base: AnyAction =
          a.type === "pass"
            ? { ...a, from: map(a.from), to: map(a.to) }
            : { ...a, entity: map(a.entity) };
        return [mapActionPositions({ ...base, id: fresh } as AnyAction, relink)];
      });
      const copiedNotes: Annotation[] = op.annotations.map((n) =>
        n.type === "freehand"
          ? {
              ...n,
              points: n.points.map((p) => ({ x: round(p.x + op.dx), y: round(p.y + op.dy) })),
            }
          : mapAnnotationPositions(n, relink),
      );
      return {
        ...d,
        entities: [...d.entities, ...copies],
        actions: [...(d.actions ?? []), ...copiedActions],
        annotations: [...(d.annotations ?? []), ...copiedNotes],
      };
    }
    case "clear_actions":
      return { ...d, actions: [] };
    case "set_court": {
      const variant = nearVariant(d.court.variant);
      const to = {
        type: op.court === "full" ? ("full" as const) : ("half" as const),
        variant: op.court === "half_far" ? `${variant}_far` : variant,
      };
      const from = d.court;
      // near half ↔ far half: the drawing is turned half a turn so it keeps its place on the court
      const nearHalf = from.type === "half" && !isFar(from);
      const farHalf = from.type === "half" && isFar(from);
      const goingFar = to.type === "half" && isFar(to);
      const goingNear = to.type === "half" && !isFar(to);
      if ((nearHalf && goingFar) || (farHalf && goingNear)) {
        const a = packFor?.(nearHalf ? from : to);
        const b = packFor?.(nearHalf ? to : from);
        if (a && b) {
          return { ...rotateHalfTurn(d, a.bounds.minY + b.bounds.maxY, pack), court: to };
        }
      }
      return { ...d, court: to };
    }
    case "add_step": {
      const n = stepCountOf(d);
      if (n >= LIMITS.steps) throw new OpError("too_many_steps", { max: LIMITS.steps });
      return { ...d, stepCount: n + 1 };
    }
    case "duplicate_step": {
      const n = stepCountOf(d);
      if (op.step > n) throw new OpError("unknown_step", { step: op.step });
      if (n >= LIMITS.steps) throw new OpError("too_many_steps", { max: LIMITS.steps });
      const titles = d.stepTitles ?? {};
      const shiftedDiagram = setStepNumbers((s) => (s > op.step ? s + 1 : s));
      const copyTitle = titles[String(op.step)];
      return {
        ...shiftedDiagram,
        stepCount: n + 1,
        ...(copyTitle
          ? {
              stepTitles: {
                ...(shiftedDiagram.stepTitles ?? {}),
                [String(op.step + 1)]: copyTitle,
              },
            }
          : {}),
      };
    }
    case "remove_step": {
      const n = stepCountOf(d);
      if (op.step > n) throw new OpError("unknown_step", { step: op.step });
      if (n <= 1) throw new OpError("last_step");
      const next = setStepNumbers((s) => (s === op.step ? null : s > op.step ? s - 1 : s));
      return { ...next, stepCount: n - 1 };
    }
    case "move_step": {
      const n = stepCountOf(d);
      if (op.step > n || op.to > n)
        throw new OpError("unknown_step", { step: Math.max(op.step, op.to) });
      const order = Array.from({ length: n }, (_, i) => i + 1).filter((s) => s !== op.step);
      order.splice(op.to - 1, 0, op.step);
      const renumber = new Map(order.map((oldStep, i) => [oldStep, i + 1] as const));
      return setStepNumbers((s) => renumber.get(s) ?? s);
    }
    case "set_step_title": {
      const n = stepCountOf(d);
      if (op.step > n) throw new OpError("unknown_step", { step: op.step });
      const titles = { ...(d.stepTitles ?? {}) };
      if (op.title === null) delete titles[String(op.step)];
      else titles[String(op.step)] = op.title;
      return { ...d, stepTitles: Object.keys(titles).length ? titles : undefined };
    }
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
      current = applyOne(current, op, packFor ? (packFor(current.court) ?? pack) : pack, packFor);
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
