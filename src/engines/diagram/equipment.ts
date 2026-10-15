import type { EquipmentKind, Diagram, Entity } from "./schema";

/**
 * The equipment registry: ONE place that says what each kind of training equipment is — how big it is on the floor (metres,
 * long side along x before rotation), which family it belongs to in the tool library, and what it counts as in the drill's
 * equipment list. The renderer draws from these sizes, the workspace builds its tool library from these families, and the
 * inventory ("8 × cones, 2 × basketballs") is counted from them — so adding a piece of equipment means adding one line here
 * (plus its name in the messages and a glyph in the renderer), nowhere else.
 */
export type EquipmentFamily = "ladders" | "hurdles" | "poles" | "hoops" | "equipment";

export interface EquipmentSpec {
  /** Width (x) and height (y) on the floor, in metres, before rotation and scale. */
  w: number;
  h: number;
  family: EquipmentFamily;
  /** The inventory bucket it is counted in (a messages key under `diagramWorkspace.inventory`). */
  counts: string;
}

export const EQUIPMENT: Readonly<Record<EquipmentKind, EquipmentSpec>> = {
  ladder: { w: 4.5, h: 0.55, family: "ladders", counts: "ladder" },
  ladder_short: { w: 2.7, h: 0.55, family: "ladders", counts: "ladder" },
  ladder_long: { w: 6.3, h: 0.55, family: "ladders", counts: "ladder" },
  hurdle_mini: { w: 0.9, h: 0.3, family: "hurdles", counts: "hurdle" },
  hurdle_low: { w: 1.0, h: 0.3, family: "hurdles", counts: "hurdle" },
  hurdle_high: { w: 1.1, h: 0.3, family: "hurdles", counts: "hurdle" },
  pole: { w: 0.22, h: 0.22, family: "poles", counts: "pole" },
  mannequin: { w: 0.7, h: 0.7, family: "poles", counts: "mannequin" },
  dummy: { w: 0.8, h: 0.55, family: "poles", counts: "mannequin" },
  hoop: { w: 1.8, h: 1.3, family: "hoops", counts: "hoop" },
  hoop_portable: { w: 1.8, h: 1.6, family: "hoops", counts: "hoop" },
  rebounder: { w: 1.4, h: 0.6, family: "equipment", counts: "rebounder" },
  passing_net: { w: 1.9, h: 0.3, family: "equipment", counts: "passingNet" },
  shooting_machine: { w: 1.0, h: 1.0, family: "equipment", counts: "shootingMachine" },
  chair: { w: 0.55, h: 0.55, family: "equipment", counts: "chair" },
  bench: { w: 1.9, h: 0.45, family: "equipment", counts: "bench" },
  band: { w: 0.9, h: 0.16, family: "equipment", counts: "band" },
  medicine_ball: { w: 0.34, h: 0.34, family: "equipment", counts: "medicineBall" },
  tennis_ball: { w: 0.16, h: 0.16, family: "equipment", counts: "tennisBall" },
  mat: { w: 2.0, h: 1.0, family: "equipment", counts: "mat" },
  timer: { w: 0.5, h: 0.5, family: "equipment", counts: "timer" },
};

export const EQUIPMENT_FAMILIES: readonly EquipmentFamily[] = [
  "ladders",
  "hurdles",
  "poles",
  "hoops",
  "equipment",
];

/** What a diagram uses: the cast, and every piece of equipment with how many of it. */
export interface Inventory {
  players: { offense: number; defense: number; coaches: number };
  /** Bucket → count, in a stable order (balls and cones first, then the registry buckets). */
  items: Array<{ key: string; count: number }>;
}

/** Count what is on the court. Pure: the same diagram always gives the same inventory. */
export function countInventory(d: Pick<Diagram, "entities">): Inventory {
  const players = { offense: 0, defense: 0, coaches: 0 };
  const items = new Map<string, number>();
  const bump = (key: string) => items.set(key, (items.get(key) ?? 0) + 1);
  for (const e of d.entities as readonly Entity[]) {
    switch (e.type) {
      case "player":
        players[e.side === "offense" ? "offense" : "defense"]++;
        break;
      case "coach":
        players.coaches++;
        break;
      case "ball":
        bump("ball");
        break;
      case "cone":
        bump("cone");
        break;
      case "equipment":
        bump(EQUIPMENT[e.kind].counts);
        break;
      case "marker":
        break;
    }
  }
  const order = ["ball", "cone", ...new Set(Object.values(EQUIPMENT).map((s) => s.counts))];
  return {
    players,
    items: order.filter((k) => items.has(k)).map((key) => ({ key, count: items.get(key)! })),
  };
}
