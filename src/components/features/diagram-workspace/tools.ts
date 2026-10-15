import {
  nextId,
  type ConeVariant,
  type DefendKind,
  type Diagram,
  type DiagramColor,
  type DiagramOp,
  type Entity,
  type EquipmentKind,
  type PassKind,
  type Position,
  type ScreenKind,
} from "@/engines/diagram";

/**
 * The tool library: every thing a coach can drag onto the court or draw with, as data. Adding a tool is adding a line here
 * (and its name in `diagramWorkspace.tools` in the messages) — the library panel, its search and categories, the
 * recent/favourite lists, the keyboard handling and the drop feedback all read this list and nothing else.
 */

export type ToolCategory =
  | "players"
  | "balls"
  | "cones"
  | "ladders"
  | "hurdles"
  | "poles"
  | "hoops"
  | "equipment"
  | "drawing"
  | "movement"
  | "passing"
  | "shooting"
  | "defense";

/** The order of the category chips (after "All"). */
export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  "players",
  "balls",
  "cones",
  "ladders",
  "hurdles",
  "poles",
  "hoops",
  "equipment",
  "drawing",
  "movement",
  "passing",
  "shooting",
  "defense",
];

/** What a "place" tool puts on the court. */
export type PlaceSpec =
  | { kind: "player"; side: "offense" | "defense"; withBall?: boolean; numbered?: boolean }
  | { kind: "coach" }
  | { kind: "ball" }
  | { kind: "cone"; variant?: ConeVariant; color?: DiagramColor; numbered?: boolean }
  | { kind: "equipment"; equipment: EquipmentKind };

/** What a "draw" tool creates when the coach drags or clicks on the court. */
export type DrawSpec =
  | { mode: "path"; type: "move" | "cut" | "sprint" | "dribble"; curve?: number }
  | { mode: "path"; type: "defend"; kind: DefendKind }
  | { mode: "pass"; kind: PassKind }
  | { mode: "shot" }
  | { mode: "screen"; kind: ScreenKind }
  | { mode: "text" }
  | { mode: "mark"; kind: "x" | "check" }
  | { mode: "zone" }
  | { mode: "circle"; color?: DiagramColor }
  | { mode: "freehand" };

export interface ToolDef {
  /** Stable id; also the key of its name in `diagramWorkspace.tools`. */
  id: string;
  category: ToolCategory;
  place?: PlaceSpec;
  draw?: DrawSpec;
  /** Extra words the search also matches (English; the translated name is matched too). */
  keywords: readonly string[];
}

const place = (
  id: string,
  category: ToolCategory,
  spec: PlaceSpec,
  keywords: readonly string[] = [],
): ToolDef => ({ id, category, place: spec, keywords });
const draw = (
  id: string,
  category: ToolCategory,
  spec: DrawSpec,
  keywords: readonly string[] = [],
): ToolDef => ({ id, category, draw: spec, keywords });

export const TOOLS: readonly ToolDef[] = [
  // players
  place("offense", "players", { kind: "player", side: "offense" }, ["attack", "offence", "player"]),
  place("defense", "players", { kind: "player", side: "defense" }, ["defender", "player"]),
  place("coach", "players", { kind: "coach" }, ["trainer"]),
  place("offenseBall", "players", { kind: "player", side: "offense", withBall: true }, [
    "with ball",
    "ball handler",
  ]),
  place("numbered", "players", { kind: "player", side: "offense", numbered: true }, [
    "number",
    "custom",
  ]),
  // balls
  place("ball", "balls", { kind: "ball" }, ["basketball"]),
  place("tennisBall", "balls", { kind: "equipment", equipment: "tennis_ball" }, ["tennis"]),
  place("medicineBall", "balls", { kind: "equipment", equipment: "medicine_ball" }, [
    "weighted",
    "medicine",
  ]),
  // cones
  place("cone", "cones", { kind: "cone" }, ["standard", "marker"]),
  place("coneTall", "cones", { kind: "cone", variant: "tall" }, ["tall"]),
  place("coneFlat", "cones", { kind: "cone", variant: "flat" }, ["flat marker", "spot"]),
  place("coneDisc", "cones", { kind: "cone", variant: "disc" }, ["disc", "saucer"]),
  place("coneColored", "cones", { kind: "cone", color: "yellow" }, ["coloured", "colored"]),
  place("coneNumbered", "cones", { kind: "cone", numbered: true }, ["number"]),
  // ladders
  place("ladder", "ladders", { kind: "equipment", equipment: "ladder" }, ["agility"]),
  place("ladderShort", "ladders", { kind: "equipment", equipment: "ladder_short" }, ["agility"]),
  place("ladderLong", "ladders", { kind: "equipment", equipment: "ladder_long" }, ["agility"]),
  // hurdles
  place("hurdleMini", "hurdles", { kind: "equipment", equipment: "hurdle_mini" }, ["jump"]),
  place("hurdleLow", "hurdles", { kind: "equipment", equipment: "hurdle_low" }, ["jump"]),
  place("hurdleHigh", "hurdles", { kind: "equipment", equipment: "hurdle_high" }, ["jump"]),
  // poles and mannequins
  place("pole", "poles", { kind: "equipment", equipment: "pole" }, ["training pole", "stick"]),
  place("mannequin", "poles", { kind: "equipment", equipment: "mannequin" }, [
    "defensive",
    "dummy",
  ]),
  place("dummy", "poles", { kind: "equipment", equipment: "dummy" }, ["blocking", "pad"]),
  // hoops
  place("hoop", "hoops", { kind: "equipment", equipment: "hoop" }, ["basket", "goal"]),
  place("hoopPortable", "hoops", { kind: "equipment", equipment: "hoop_portable" }, [
    "basket",
    "goal",
    "portable",
  ]),
  // other equipment
  place("rebounder", "equipment", { kind: "equipment", equipment: "rebounder" }, ["return"]),
  place("passingNet", "equipment", { kind: "equipment", equipment: "passing_net" }, ["net"]),
  place("shootingMachine", "equipment", { kind: "equipment", equipment: "shooting_machine" }, [
    "gun",
  ]),
  place("chair", "equipment", { kind: "equipment", equipment: "chair" }, ["training chair"]),
  place("bench", "equipment", { kind: "equipment", equipment: "bench" }, ["seat"]),
  place("band", "equipment", { kind: "equipment", equipment: "band" }, ["resistance"]),
  place("mat", "equipment", { kind: "equipment", equipment: "mat" }, ["floor"]),
  place("timer", "equipment", { kind: "equipment", equipment: "timer" }, ["stopwatch", "clock"]),
  // drawing
  draw("text", "drawing", { mode: "text" }, ["note", "label"]),
  draw("circle", "drawing", { mode: "circle" }, ["zone", "ring"]),
  draw("rectangle", "drawing", { mode: "zone" }, ["zone", "box", "area"]),
  draw("freehand", "drawing", { mode: "freehand" }, ["pen", "draw", "pencil"]),
  draw("markX", "drawing", { mode: "mark", kind: "x" }, ["cross", "wrong"]),
  draw("markCheck", "drawing", { mode: "mark", kind: "check" }, ["tick", "right"]),
  draw("highlight", "drawing", { mode: "circle", color: "yellow" }, ["highlighter", "focus"]),
  // movement
  draw("move", "movement", { mode: "path", type: "move" }, ["walk", "run", "arrow", "straight"]),
  draw("moveCurved", "movement", { mode: "path", type: "move", curve: 0.45 }, ["curve", "arc"]),
  draw("sprint", "movement", { mode: "path", type: "sprint" }, ["fast", "run"]),
  draw("cut", "movement", { mode: "path", type: "cut" }, ["cutter", "basket cut"]),
  draw("dribble", "movement", { mode: "path", type: "dribble" }, ["ball handling", "handle"]),
  draw("screenBall", "movement", { mode: "screen", kind: "ball" }, ["pick", "pick and roll"]),
  draw("screenDown", "movement", { mode: "screen", kind: "down" }, ["pick"]),
  draw("screenBack", "movement", { mode: "screen", kind: "back" }, ["pick"]),
  draw("screenFlare", "movement", { mode: "screen", kind: "flare" }, ["pick"]),
  draw("screenCross", "movement", { mode: "screen", kind: "cross" }, ["pick"]),
  draw("screenStagger", "movement", { mode: "screen", kind: "stagger" }, ["pick", "double"]),
  // passing
  draw("pass", "passing", { mode: "pass", kind: "standard" }, ["chest pass"]),
  draw("passBounce", "passing", { mode: "pass", kind: "bounce" }, ["bounce pass"]),
  draw("passSkip", "passing", { mode: "pass", kind: "skip" }, ["skip pass"]),
  draw("passOverhead", "passing", { mode: "pass", kind: "overhead" }, ["overhead pass"]),
  // shooting
  draw("shot", "shooting", { mode: "shot" }, ["shoot", "basket", "layup", "jump shot"]),
  // defense
  draw("slide", "defense", { mode: "path", type: "defend", kind: "slide" }, ["defensive slide"]),
  draw("closeout", "defense", { mode: "path", type: "defend", kind: "closeout" }, []),
  draw("help", "defense", { mode: "path", type: "defend", kind: "help" }, ["help defense"]),
  draw("recover", "defense", { mode: "path", type: "defend", kind: "recover" }, []),
  draw("switch", "defense", { mode: "path", type: "defend", kind: "switch" }, []),
  draw("trap", "defense", { mode: "path", type: "defend", kind: "trap" }, ["double team"]),
  draw("hedge", "defense", { mode: "path", type: "defend", kind: "hedge" }, []),
  draw("drop", "defense", { mode: "path", type: "defend", kind: "drop" }, ["drop coverage"]),
];

export const TOOL_BY_ID: ReadonlyMap<string, ToolDef> = new Map(TOOLS.map((t) => [t.id, t]));

/** Tools grouped for the "All" view: placeable objects first, then the things you draw. */
export function toolsIn(category: ToolCategory | "all"): readonly ToolDef[] {
  return category === "all" ? TOOLS : TOOLS.filter((t) => t.category === category);
}

/** Case-insensitive search over the translated name and the keywords. `name` translates a tool id. */
export function searchTools(
  query: string,
  name: (id: string) => string,
  within: readonly ToolDef[] = TOOLS,
): readonly ToolDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return within;
  return within.filter(
    (t) =>
      name(t.id).toLowerCase().includes(q) || t.keywords.some((k) => k.toLowerCase().includes(q)),
  );
}

// ---------------------------------------------------------------------------------------------
// Placing
// ---------------------------------------------------------------------------------------------

export interface PlaceOptions {
  /** A number typed for a numbered player or cone. */
  number?: string;
  /** Carriers that hold no ball right now (a dropped ball goes to the one it lands on). */
  dropOn?: { id: string; hasBall: boolean } | null;
}

/**
 * The operations that put a tool's object at `at`. Ids are chosen here (from the diagram as it is now) when one operation
 * refers to the result of another — a player and the ball placed in their hands.
 */
export function placeOps(
  spec: PlaceSpec,
  at: Position,
  d: Pick<Diagram, "entities" | "actions">,
  opts: PlaceOptions = {},
): DiagramOp[] {
  const taken = () => [...d.entities.map((e) => e.id), ...d.actions.map((a) => a.id)];
  switch (spec.kind) {
    case "player": {
      const id = nextId(spec.side === "offense" ? "o" : "x", taken());
      const label = spec.numbered ? cleanNumber(opts.number) : undefined;
      const ops: DiagramOp[] = [
        { op: "add_player", id, side: spec.side, ...(label ? { label } : {}), at },
      ];
      if (spec.withBall) ops.push({ op: "add_ball", heldBy: id });
      return ops;
    }
    case "coach":
      return [{ op: "add_coach", at }];
    case "ball": {
      const target = opts.dropOn;
      return target && !target.hasBall
        ? [{ op: "add_ball", heldBy: target.id }]
        : [{ op: "add_ball", at }];
    }
    case "cone": {
      const label = spec.numbered
        ? (cleanNumber(opts.number) ??
          String(d.entities.filter((e) => e.type === "cone").length + 1))
        : undefined;
      return [
        {
          op: "add_cone",
          at,
          ...(spec.variant ? { variant: spec.variant } : {}),
          ...(spec.color ? { color: spec.color } : {}),
          ...(label ? { label: label.slice(0, 3) } : {}),
        },
      ];
    }
    case "equipment":
      return [{ op: "add_equipment", kind: spec.equipment, at }];
  }
}

const cleanNumber = (raw?: string) => {
  const v = (raw ?? "").trim().slice(0, 3);
  return v || undefined;
};

/** Everything on the court that the tool would add, counted (a tool that adds nothing yet is refused early). */
export const willAdd = (spec: PlaceSpec): number =>
  spec.kind === "player" && spec.withBall ? 2 : 1;

/**
 * A sensible starting spot for an object added by a CLICK on its tool (no drop target): named court spots first, cycling so
 * that new objects never land on top of each other, then a grid of free places. Coaches then drag, or press an arrow key.
 */
export function defaultSpot(
  spec: PlaceSpec,
  entities: readonly Entity[],
  occupied: readonly { x: number; y: number }[],
  anchors: Readonly<Record<string, { x: number; y: number }>>,
): Position {
  const preferred =
    spec.kind === "player" || spec.kind === "coach"
      ? [
          "top_key",
          "left_wing",
          "right_wing",
          "left_slot",
          "right_slot",
          "left_corner",
          "right_corner",
          "left_elbow",
          "right_elbow",
        ]
      : spec.kind === "ball"
        ? ["free_throw_line", "top_key", "left_elbow", "right_elbow"]
        : [
            "left_elbow",
            "right_elbow",
            "left_block",
            "right_block",
            "free_throw_line",
            "left_wing",
          ];
  const free = (p: { x: number; y: number }) =>
    occupied.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > 1.1);
  for (const name of preferred) {
    const a = anchors[name];
    if (a && free(a)) return { anchor: name };
  }
  // every preferred spot is taken: walk a grid across the middle of the court
  const cx = Object.values(anchors).find(Boolean)?.x ?? 0;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 9; col++) {
      const p = { x: cx - 6 + col * 1.5, y: 2 + row * 1.5 };
      if (free(p)) return { x: p.x, y: p.y };
    }
  }
  void entities;
  return { x: cx, y: 6 };
}
