import {
  resolveDiagram,
  type CourtPack,
  type DiagramInput,
  type Position,
} from "@/engines/diagram";

/**
 * Pure helpers for the diagram builder. The builder edits a plain `DiagramInput` object directly
 * (no parallel "UI model"), so anything the schema can express — including diagrams copied from the
 * library — round-trips through the editor without loss.
 */
export type Diagram = DiagramInput;
export type Entity = Diagram["entities"][number];
export type Action = NonNullable<Diagram["actions"]>[number];
export type Annotation = NonNullable<Diagram["annotations"]>[number];

export type EntityKind = "offense" | "defense" | "coach" | "ball" | "cone" | "marker";
export const ENTITY_KINDS: readonly EntityKind[] = [
  "offense",
  "defense",
  "coach",
  "ball",
  "cone",
  "marker",
];
export const ACTION_TYPES = ["pass", "cut", "move", "dribble", "screen", "shot"] as const;
export type ActionKind = (typeof ACTION_TYPES)[number];

const ID_PREFIX: Record<EntityKind, string> = {
  offense: "o",
  defense: "x",
  coach: "c",
  ball: "b",
  cone: "k",
  marker: "m",
};

export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; i < 1000; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
  return `${prefix}${Date.now() % 100000}`;
}

export const kindOf = (e: Entity): EntityKind =>
  e.type === "player" ? (e.side === "defense" ? "defense" : "offense") : (e.type as EntityKind);

export const blankDiagram = (
  sport: string,
  court: { type: "half" | "full"; variant: string },
): Diagram => ({
  schemaVersion: 1,
  sport,
  court,
  entities: [],
  actions: [],
  annotations: [],
});

/** Sensible default label: offence = next number, defence = X + number. */
function defaultLabel(kind: EntityKind, entities: Entity[]): string | undefined {
  const same = entities.filter((e) => kindOf(e) === kind).length + 1;
  if (kind === "offense") return String(Math.min(same, 9));
  if (kind === "defense") return `X${Math.min(same, 9)}`;
  return undefined;
}

/** First usable preferred anchor (cycling by `i`), else any available one — so new items never stack on one spot. */
export function pickAnchor(
  available: readonly string[],
  preferred: readonly string[],
  i = 0,
): string {
  const usable = preferred.filter((p) => available.includes(p));
  return usable.length ? usable[i % usable.length]! : (available[0] ?? "basket");
}

const PLAYER_SPOTS = [
  "top_key",
  "left_wing",
  "right_wing",
  "left_slot",
  "right_slot",
  "left_corner",
  "right_corner",
  "left_elbow",
  "right_elbow",
];
const CONE_SPOTS = ["left_elbow", "right_elbow", "left_block", "right_block", "free_throw_line"];

/** `anchors` = the names available on this court; each kind gets a distinct, sensible starting spot. */
export function newEntity(
  kind: EntityKind,
  entities: Entity[],
  anchors: readonly string[],
): Entity {
  const id = nextId(
    ID_PREFIX[kind],
    entities.map((e) => e.id),
  );
  const label = defaultLabel(kind, entities);
  const same = entities.filter((e) => kindOf(e) === kind).length;
  const spot = (list: readonly string[]): Position => ({ anchor: pickAnchor(anchors, list, same) });
  switch (kind) {
    case "offense":
      return {
        id,
        type: "player",
        side: "offense",
        ...(label ? { label } : {}),
        at: spot(PLAYER_SPOTS),
      };
    case "defense": {
      // a defender starts just goal-side of the matching offensive spot
      const base = spot(PLAYER_SPOTS) as { anchor: string };
      return {
        id,
        type: "player",
        side: "defense",
        ...(label ? { label } : {}),
        at: { anchor: base.anchor, offset: [0, -1.3] },
      };
    }
    case "coach":
      return {
        id,
        type: "coach",
        at: { anchor: pickAnchor(anchors, ["half_court_center", "top_key"], same) },
      };
    case "cone":
      return { id, type: "cone", at: spot(CONE_SPOTS) };
    case "marker":
      return { id, type: "marker", kind: "spot", at: spot(CONE_SPOTS) };
    case "ball": {
      const holder = entities.find(
        (e) =>
          (e.type === "player" || e.type === "coach") &&
          !entities.some((b) => b.type === "ball" && b.heldBy === e.id),
      );
      return holder
        ? { id, type: "ball", heldBy: holder.id }
        : { id, type: "ball", at: spot(PLAYER_SPOTS) };
    }
  }
}

/** Human name for pickers and messages: the label if there is one, else the kind and id. */
export function entityName(e: Entity): string {
  if ((e.type === "player" || e.type === "coach" || e.type === "marker") && e.label) return e.label;
  return e.id;
}

export const carriers = (d: Diagram) =>
  d.entities.filter((e) => e.type === "player" || e.type === "coach");

export function newAction(type: ActionKind, d: Diagram, anchor: string): Action {
  const id = nextId(
    "a",
    (d.actions ?? []).map((a) => a.id),
  );
  const step = Math.max(1, ...(d.actions ?? []).map((a) => a.step ?? 1));
  const who = carriers(d);
  const first = who[0]?.id ?? "";
  const second = who[1]?.id ?? first;
  switch (type) {
    case "pass":
      return { id, step, type, from: first, to: second };
    case "screen":
      return { id, step, type, entity: first, target: { entity: second } };
    case "shot":
      return { id, step, type, entity: first };
    default:
      return { id, step, type, entity: first, path: [{ anchor }] };
  }
}

export function newAnnotation(
  kind: "text" | "zone_rect" | "zone_circle",
  anchor: string,
): Annotation {
  if (kind === "text") return { type: "text", at: { anchor, offset: [0, 1.5] }, text: "Note" };
  if (kind === "zone_circle") return { type: "zone_circle", center: { anchor }, radius: 1.5 };
  return {
    type: "zone_rect",
    from: { anchor, offset: [-1.5, -1] },
    to: { anchor, offset: [1.5, 1] },
  };
}

const refsEntity = (p: Position | undefined, id: string) => !!p && "entity" in p && p.entity === id;

/**
 * Remove an entity and everything that depends on it: actions it takes part in, a ball it holds
 * becomes loose where it lay, and positions defined relative to it are frozen to where it stood.
 */
export function removeEntity(d: Diagram, id: string, pack: CourtPack): Diagram {
  const strict = d as Parameters<typeof resolveDiagram>[0];
  const resolved = resolveDiagram(strict, pack).resolved.entities;
  const where = resolved.find((r) => r.entity.id === id)?.at;
  const freeze = (p: Position): Position => {
    if (!refsEntity(p, id)) return p;
    const off = (p as { offset?: [number, number] }).offset ?? [0, 0];
    return where
      ? { x: round(where.x + off[0]), y: round(where.y + off[1]) }
      : { anchor: Object.keys(pack.anchors)[0] ?? "basket" };
  };
  const round = (n: number) => Math.round(n * 100) / 100;

  const entities: Entity[] = d.entities
    .filter((e) => e.id !== id)
    .map((e) => {
      if (e.type === "ball" && e.heldBy === id) {
        const ball = resolved.find((r) => r.entity.id === e.id)?.at;
        return {
          id: e.id,
          type: "ball",
          at: ball ? { x: round(ball.x), y: round(ball.y) } : { anchor: "basket" },
        } as Entity;
      }
      return "at" in e && e.at ? ({ ...e, at: freeze(e.at) } as Entity) : e;
    });

  const involves = (a: Action) =>
    a.type === "pass" ? a.from === id || a.to === id : a.entity === id;
  const actions: Action[] = (d.actions ?? [])
    .filter((a) => !involves(a))
    .map((a) => {
      if (a.type === "screen") return { ...a, target: freeze(a.target) };
      if (a.type === "shot") return a.to ? { ...a, to: freeze(a.to) } : a;
      if (a.type === "cut" || a.type === "move" || a.type === "dribble")
        return { ...a, path: a.path.map(freeze) };
      return a;
    });

  const annotations: Annotation[] = (d.annotations ?? []).map((n) => {
    if (n.type === "text") return { ...n, at: freeze(n.at) };
    if (n.type === "zone_rect") return { ...n, from: freeze(n.from), to: freeze(n.to) };
    return { ...n, center: freeze(n.center) };
  });

  return { ...d, entities, actions, annotations };
}

/** Anchors grouped for pickers: this end of the court first, then the far end. */
export function anchorGroups(pack: CourtPack): { near: string[]; far: string[] } {
  const names = Object.keys(pack.anchors);
  return {
    near: names.filter((n) => !n.startsWith("far_")),
    far: names.filter((n) => n.startsWith("far_")),
  };
}

export const anchorText = (name: string) => name.replaceAll("_", " ");

export type PositionMode = "anchor" | "xy" | "entity";
export const modeOf = (p: Position): PositionMode =>
  "x" in p ? "xy" : "anchor" in p ? "anchor" : "entity";
