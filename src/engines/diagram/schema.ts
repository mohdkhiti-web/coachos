import { z } from "zod";

/**
 * Diagram schema v1 (ARCHITECTURE.md §10.3). A diagram is STRUCTURED DATA — never an image:
 * typed entities + typed actions, resolved by a pure function and drawn by an SVG renderer, so the
 * same JSON can later feed drill pages, session builders, PDFs, PNGs, an editor and AI generation.
 *
 * Positions accept three forms so the JSON stays human-readable and LLM-friendly:
 *   { x, y }                         absolute metres in the court's coordinate system
 *   { anchor: "top_key", offset? }   a NAMED court position owned by the sport's court pack
 *   { entity: "o1", offset? }        relative to another entity's starting position
 */

export const DIAGRAM_SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  entities: 30,
  actions: 60,
  annotations: 20,
  steps: 12,
  pathPoints: 6,
  label: 3,
  zoneLabel: 24,
  text: 40,
  balls: 6,
} as const;

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/, { error: "bad_id" });
const anchorName = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, { error: "bad_anchor" });
const coord = z.number().finite().min(-60).max(60);
const offset = z.tuple([
  z.number().finite().min(-10).max(10),
  z.number().finite().min(-10).max(10),
]);
const label = z.string().trim().min(1).max(LIMITS.label);

export const positionSchema = z.union([
  z.strictObject({ x: coord, y: coord }),
  z.strictObject({ anchor: anchorName, offset: offset.optional() }),
  z.strictObject({ entity: id, offset: offset.optional() }),
]);
export type Position = z.infer<typeof positionSchema>;

// ---------------------------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------------------------

export const ENTITY_TYPES = ["player", "coach", "ball", "cone", "marker"] as const;
export const MARKER_KINDS = ["start", "end", "spot"] as const;

const playerEntity = z.strictObject({
  id,
  type: z.literal("player"),
  side: z.enum(["offense", "defense"]),
  label: label.optional(),
  at: positionSchema,
});
const coachEntity = z.strictObject({
  id,
  type: z.literal("coach"),
  label: label.optional(),
  at: positionSchema,
});
/** A ball is either held by a player/coach (`heldBy`) or lies at a position (`at`) — exactly one (checked semantically). */
const ballEntity = z.strictObject({
  id,
  type: z.literal("ball"),
  heldBy: id.optional(),
  at: positionSchema.optional(),
});
const coneEntity = z.strictObject({ id, type: z.literal("cone"), at: positionSchema });
const markerEntity = z.strictObject({
  id,
  type: z.literal("marker"),
  kind: z.enum(MARKER_KINDS),
  label: label.optional(),
  at: positionSchema,
});

export const entitySchema = z.discriminatedUnion("type", [
  playerEntity,
  coachEntity,
  ballEntity,
  coneEntity,
  markerEntity,
]);
export type Entity = z.infer<typeof entitySchema>;

// ---------------------------------------------------------------------------------------------
// Actions (the sport pack decides which of these it allows and how they look)
// ---------------------------------------------------------------------------------------------

export const ACTION_TYPES = ["pass", "cut", "move", "dribble", "screen", "shot"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const step = z.int().min(1).max(LIMITS.steps).default(1);
const path = z.array(positionSchema).min(1).max(LIMITS.pathPoints);

const passAction = z.strictObject({ id, step, type: z.literal("pass"), from: id, to: id });
const shotAction = z.strictObject({
  id,
  step,
  type: z.literal("shot"),
  entity: id,
  /** Defaults to the sport's primary target (the basket). */
  to: positionSchema.optional(),
});
const moveAction = (type: "cut" | "move" | "dribble") =>
  z.strictObject({ id, step, type: z.literal(type), entity: id, path });
const screenAction = z.strictObject({
  id,
  step,
  type: z.literal("screen"),
  entity: id,
  /** Where/whom the screen is set on. */
  target: positionSchema,
});

export const actionSchema = z.discriminatedUnion("type", [
  passAction,
  shotAction,
  moveAction("cut"),
  moveAction("move"),
  moveAction("dribble"),
  screenAction,
]);
export type Action = z.infer<typeof actionSchema>;

// ---------------------------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------------------------

const zoneLabel = z.string().trim().min(1).max(LIMITS.zoneLabel);
export const annotationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("zone_rect"),
    from: positionSchema,
    to: positionSchema,
    label: zoneLabel.optional(),
  }),
  z.strictObject({
    type: z.literal("zone_circle"),
    center: positionSchema,
    radius: z.number().finite().min(0.5).max(10),
    label: zoneLabel.optional(),
  }),
  z.strictObject({
    type: z.literal("text"),
    at: positionSchema,
    text: z.string().trim().min(1).max(LIMITS.text),
  }),
]);
export type Annotation = z.infer<typeof annotationSchema>;

// ---------------------------------------------------------------------------------------------
// Diagram
// ---------------------------------------------------------------------------------------------

export const courtSchema = z.strictObject({
  type: z.enum(["half", "full"]),
  variant: z.string().regex(/^[a-z][a-z0-9_]{0,20}$/),
});
export type CourtRef = z.infer<typeof courtSchema>;

export const diagramSchema = z.strictObject({
  schemaVersion: z.literal(DIAGRAM_SCHEMA_VERSION),
  sport: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  court: courtSchema,
  entities: z.array(entitySchema).max(LIMITS.entities),
  actions: z.array(actionSchema).max(LIMITS.actions).default([]),
  annotations: z.array(annotationSchema).max(LIMITS.annotations).default([]),
});

/** Parsed (defaults applied) diagram. */
export type Diagram = z.output<typeof diagramSchema>;
/** What callers may write (defaults optional). */
export type DiagramInput = z.input<typeof diagramSchema>;

/** Hard cap on serialized size, a defence against oversized JSON columns. */
export const MAX_DIAGRAM_BYTES = 48 * 1024;
