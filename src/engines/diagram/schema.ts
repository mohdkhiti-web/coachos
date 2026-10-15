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
  entities: 80,
  actions: 100,
  annotations: 40,
  steps: 12,
  pathPoints: 8,
  freehandPoints: 48,
  stepTitle: 30,
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

export const ENTITY_TYPES = ["player", "coach", "ball", "cone", "marker", "equipment"] as const;
export const MARKER_KINDS = ["start", "end", "spot"] as const;
export const CONE_VARIANTS = ["standard", "tall", "disc", "flat"] as const;
/** Named colours (never raw CSS): they map to a fixed, contrast-checked palette in the renderer, so a diagram stays safe and printable. */
export const DIAGRAM_COLORS = [
  "orange",
  "blue",
  "green",
  "red",
  "yellow",
  "purple",
  "black",
  "white",
] as const;
export type DiagramColor = (typeof DIAGRAM_COLORS)[number];
export const EQUIPMENT_KINDS = [
  "ladder",
  "ladder_short",
  "ladder_long",
  "hurdle_mini",
  "hurdle_low",
  "hurdle_high",
  "pole",
  "mannequin",
  "dummy",
  "hoop",
  "hoop_portable",
  "rebounder",
  "passing_net",
  "shooting_machine",
  "chair",
  "bench",
  "band",
  "medicine_ball",
  "tennis_ball",
  "mat",
  "timer",
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

/** How an object is turned, scaled and coloured. All optional: a diagram that never sets them is exactly as before. */
const look = {
  rotation: z.int().min(-180).max(180).optional(),
  scale: z.number().finite().min(0.5).max(3).optional(),
  color: z.enum(DIAGRAM_COLORS).optional(),
};

const playerEntity = z.strictObject({
  id,
  type: z.literal("player"),
  side: z.enum(["offense", "defense"]),
  label: label.optional(),
  at: positionSchema,
  ...look,
});
const coachEntity = z.strictObject({
  id,
  type: z.literal("coach"),
  label: label.optional(),
  at: positionSchema,
  ...look,
});
/** A ball is either held by a player/coach (`heldBy`) or lies at a position (`at`) — exactly one (checked semantically). */
const ballEntity = z.strictObject({
  id,
  type: z.literal("ball"),
  heldBy: id.optional(),
  at: positionSchema.optional(),
  scale: look.scale,
});
const coneEntity = z.strictObject({
  id,
  type: z.literal("cone"),
  variant: z.enum(CONE_VARIANTS).optional(),
  /** A number on the cone ("numbered cone"). */
  label: label.optional(),
  at: positionSchema,
  ...look,
});
/** Training equipment: ladders, hurdles, poles, hoops … Which kinds exist is the registry in ./equipment. */
const equipmentEntity = z.strictObject({
  id,
  type: z.literal("equipment"),
  kind: z.enum(EQUIPMENT_KINDS),
  label: label.optional(),
  at: positionSchema,
  ...look,
});
const markerEntity = z.strictObject({
  id,
  type: z.literal("marker"),
  kind: z.enum(MARKER_KINDS),
  label: label.optional(),
  at: positionSchema,
  ...look,
});

export const entitySchema = z.discriminatedUnion("type", [
  playerEntity,
  coachEntity,
  ballEntity,
  coneEntity,
  markerEntity,
  equipmentEntity,
]);
export type Entity = z.infer<typeof entitySchema>;

// ---------------------------------------------------------------------------------------------
// Actions (the sport pack decides which of these it allows and how they look)
// ---------------------------------------------------------------------------------------------

export const ACTION_TYPES = [
  "pass",
  "cut",
  "move",
  "dribble",
  "screen",
  "shot",
  "sprint",
  "defend",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const PASS_KINDS = ["standard", "bounce", "skip", "overhead"] as const;
export const SCREEN_KINDS = ["ball", "down", "back", "flare", "cross", "stagger"] as const;
export const DEFEND_KINDS = [
  "slide",
  "closeout",
  "help",
  "recover",
  "switch",
  "trap",
  "hedge",
  "drop",
] as const;
export const LINE_WEIGHTS = ["thin", "normal", "thick"] as const;

/** How a line is drawn: bend, weight and colour. Optional, so existing diagrams draw exactly as before. */
const stroke = {
  curve: z.number().finite().min(-1).max(1).optional(),
  weight: z.enum(LINE_WEIGHTS).optional(),
  color: z.enum(DIAGRAM_COLORS).optional(),
};

const step = z.int().min(1).max(LIMITS.steps).default(1);
const path = z.array(positionSchema).min(1).max(LIMITS.pathPoints);

const passAction = z.strictObject({
  id,
  step,
  type: z.literal("pass"),
  from: id,
  to: id,
  kind: z.enum(PASS_KINDS).optional(),
  ...stroke,
});
const shotAction = z.strictObject({
  id,
  step,
  type: z.literal("shot"),
  entity: id,
  /** Defaults to the sport's primary target (the basket). */
  to: positionSchema.optional(),
  ...stroke,
});
const moveAction = (type: "cut" | "move" | "dribble" | "sprint") =>
  z.strictObject({ id, step, type: z.literal(type), entity: id, path, ...stroke });
const defendAction = z.strictObject({
  id,
  step,
  type: z.literal("defend"),
  kind: z.enum(DEFEND_KINDS),
  entity: id,
  path,
  ...stroke,
});
const screenAction = z.strictObject({
  id,
  step,
  type: z.literal("screen"),
  entity: id,
  /** Where/whom the screen is set on. */
  target: positionSchema,
  kind: z.enum(SCREEN_KINDS).optional(),
  ...stroke,
});

export const actionSchema = z.discriminatedUnion("type", [
  passAction,
  shotAction,
  moveAction("cut"),
  moveAction("move"),
  moveAction("dribble"),
  moveAction("sprint"),
  defendAction,
  screenAction,
]);
export type Action = z.infer<typeof actionSchema>;

// ---------------------------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------------------------

const zoneLabel = z.string().trim().min(1).max(LIMITS.zoneLabel);
export const MARK_KINDS = ["x", "check"] as const;
export const annotationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("zone_rect"),
    from: positionSchema,
    to: positionSchema,
    label: zoneLabel.optional(),
    color: z.enum(DIAGRAM_COLORS).optional(),
  }),
  z.strictObject({
    type: z.literal("zone_circle"),
    center: positionSchema,
    radius: z.number().finite().min(0.5).max(10),
    label: zoneLabel.optional(),
    color: z.enum(DIAGRAM_COLORS).optional(),
  }),
  z.strictObject({
    type: z.literal("text"),
    at: positionSchema,
    text: z.string().trim().min(1).max(LIMITS.text),
    color: z.enum(DIAGRAM_COLORS).optional(),
  }),
  /** An X or a tick on the court ("wrong spot" / "right spot"). */
  z.strictObject({
    type: z.literal("mark"),
    kind: z.enum(MARK_KINDS),
    at: positionSchema,
    color: z.enum(DIAGRAM_COLORS).optional(),
  }),
  /** A hand-drawn line: plain coordinates only (no anchors), thinned before it is stored. */
  z.strictObject({
    type: z.literal("freehand"),
    points: z
      .array(z.strictObject({ x: coord, y: coord }))
      .min(2)
      .max(LIMITS.freehandPoints),
    color: z.enum(DIAGRAM_COLORS).optional(),
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
  /**
   * How many steps the drill has, even when a step has no action of its own yet (a step that only holds the positions the
   * previous one left). Absent = as many as the actions use.
   */
  stepCount: z.int().min(1).max(LIMITS.steps).optional(),
  /** Optional names for steps, keyed "1" to "12": "Starting positions", "Cut to the rim". */
  stepTitles: z
    .record(z.string().regex(/^(?:[1-9]|1[0-2])$/), z.string().trim().min(1).max(LIMITS.stepTitle))
    .optional(),
});

/** Parsed (defaults applied) diagram. */
export type Diagram = z.output<typeof diagramSchema>;
/** What callers may write (defaults optional). */
export type DiagramInput = z.input<typeof diagramSchema>;

/** Hard cap on serialized size, a defence against oversized JSON columns. */
export const MAX_DIAGRAM_BYTES = 128 * 1024;

/** Shared shapes so the operations vocabulary (ops.ts) cannot drift from the schema. */
export const lookShape = look;
export const strokeShape = stroke;

export type ConeVariant = (typeof CONE_VARIANTS)[number];
export type PassKind = (typeof PASS_KINDS)[number];
export type ScreenKind = (typeof SCREEN_KINDS)[number];
export type DefendKind = (typeof DEFEND_KINDS)[number];
export type LineWeight = (typeof LINE_WEIGHTS)[number];
