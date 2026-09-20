import { describe, expect, it } from "vitest";
import {
  diagramSchema,
  resolveDiagram,
  validateDiagram,
  type Diagram as Parsed,
} from "@/engines/diagram";
import { FIBA_FULL_COURT, FIBA_HALF_COURT } from "@/sports/basketball/court-fiba";
import {
  blankDiagram,
  newAction,
  newAnnotation,
  newEntity,
  nextId,
  pickAnchor,
  removeEntity,
  type Diagram,
  type Entity,
} from "./model";

const anchors = Object.keys(FIBA_HALF_COURT.anchors);
const parse = (d: Diagram): Parsed => diagramSchema.parse(d);
const start = blankDiagram("basketball", { type: "half", variant: "fiba" });

/** Build a diagram the way the UI does: one "add" click at a time. */
function build(kinds: Array<Parameters<typeof newEntity>[0]>): Diagram {
  let entities: Entity[] = [];
  for (const k of kinds) entities = [...entities, newEntity(k, entities, anchors)];
  return { ...start, entities };
}

describe("builder: adding things", () => {
  it("generates unique, readable ids", () => {
    expect(nextId("o", ["o1", "o2"])).toBe("o3");
    expect(nextId("o", ["o2"])).toBe("o1");
    expect(nextId("x", [])).toBe("x1");
  });

  it("places new players on DISTINCT court spots (never stacked on the basket)", () => {
    const d = build(["offense", "offense", "offense", "offense", "offense"]);
    const spots = d.entities.map((e) => JSON.stringify((e as { at: unknown }).at));
    expect(new Set(spots).size).toBe(5);
    expect(spots.join()).not.toContain("basket");
    expect(validateDiagram(parse(d), FIBA_HALF_COURT)).toEqual([]);
  });

  it("labels offence 1,2,3 and defenders X1,X2, and puts a defender goal-side of the matching spot", () => {
    const d = build(["offense", "offense", "defense", "defense"]);
    expect(d.entities.map((e) => ("label" in e ? e.label : undefined))).toEqual([
      "1",
      "2",
      "X1",
      "X2",
    ]);
    const x1 = d.entities[2] as { at: { anchor: string; offset?: [number, number] } };
    expect(x1.at.anchor).toBe("top_key");
    expect(x1.at.offset).toEqual([0, -1.3]);
  });

  it("a new ball goes to the first player without one, and a second ball to the next", () => {
    const d = build(["offense", "offense", "ball", "ball", "ball"]);
    const balls = d.entities.filter((e) => e.type === "ball") as Array<{
      heldBy?: string;
      at?: unknown;
    }>;
    expect(balls[0]?.heldBy).toBe("o1");
    expect(balls[1]?.heldBy).toBe("o2");
    expect(balls[2]?.heldBy).toBeUndefined(); // nobody left → loose ball on the court
    expect(balls[2]?.at).toBeDefined();
    expect(validateDiagram(parse(d), FIBA_HALF_COURT)).toEqual([]);
  });

  it("uses only anchors the court actually has", () => {
    expect(pickAnchor(["a", "b"], ["x", "b"])).toBe("b");
    expect(pickAnchor(["a", "b"], ["x", "y"])).toBe("a");
    expect(pickAnchor([], ["x"])).toBe("basket");
  });

  it("new actions are valid immediately for a sensible diagram", () => {
    const base = build(["offense", "offense", "defense", "ball"]);
    for (const kind of ["pass", "cut", "move", "dribble", "screen", "shot"] as const) {
      const d: Diagram = { ...base, actions: [newAction(kind, base, "free_throw_line")] };
      const issues = validateDiagram(parse(d), FIBA_HALF_COURT);
      expect(issues, kind).toEqual([]);
    }
  });

  it("steps advance: a new action defaults to the latest step in use", () => {
    const base = build(["offense", "offense", "ball"]);
    const d1: Diagram = {
      ...base,
      actions: [{ id: "a1", step: 3, type: "pass", from: "o1", to: "o2" }],
    };
    expect(newAction("shot", d1, "top_key").step).toBe(3);
  });

  it("new notes and zones are valid", () => {
    for (const k of ["text", "zone_rect", "zone_circle"] as const) {
      const d: Diagram = { ...build(["offense"]), annotations: [newAnnotation(k, "top_key")] };
      expect(validateDiagram(parse(d), FIBA_HALF_COURT), k).toEqual([]);
    }
  });
});

describe("builder: removing a player keeps the diagram whole", () => {
  const base: Diagram = {
    ...build(["offense", "offense", "offense", "defense", "ball"]),
  };
  const withActions: Diagram = {
    ...base,
    entities: base.entities.map((e) =>
      e.id === "x1" ? { ...e, at: { entity: "o2", offset: [0, -1.2] } } : e,
    ) as Entity[],
    actions: [
      { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
      {
        id: "a2",
        step: 1,
        type: "cut",
        entity: "o3",
        path: [{ entity: "o2" }, { anchor: "left_block" }],
      },
      { id: "a3", step: 2, type: "screen", entity: "o3", target: { entity: "o2" } },
      { id: "a4", step: 3, type: "shot", entity: "o1" },
    ],
    annotations: [{ type: "text", at: { entity: "o2", offset: [0, 2] }, text: "Read" }],
  };

  it("drops actions the player performs or receives; actions that merely POINT at their spot are kept, frozen there", () => {
    const next = removeEntity(withActions, "o2", FIBA_HALF_COURT);
    expect(next.entities.map((e) => e.id)).toEqual(["o1", "o3", "x1", "b1"]);
    // a1 (pass o1→o2) is gone — nobody left to receive it; the others survive
    expect(next.actions?.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
    const cut = next.actions?.find((a) => a.id === "a2") as {
      path: Array<Record<string, unknown>>;
    };
    expect(cut.path[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) }); // was { entity: "o2" }
    expect(cut.path[1]).toEqual({ anchor: "left_block" }); // untouched
    const screen = next.actions?.find((a) => a.id === "a3") as { target: Record<string, unknown> };
    expect(screen.target).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(validateDiagram(parse(next), FIBA_HALF_COURT)).toEqual([]);
  });

  it("freezes anything positioned relative to the removed player at where they stood", () => {
    const before = resolveDiagram(parse(withActions), FIBA_HALF_COURT).resolved.entities;
    const o2 = before.find((r) => r.entity.id === "o2")!.at;
    const x1Before = before.find((r) => r.entity.id === "x1")!.at;
    const next = removeEntity(withActions, "o2", FIBA_HALF_COURT);
    const x1 = next.entities.find((e) => e.id === "x1") as { at: { x: number; y: number } };
    expect(x1.at.x).toBeCloseTo(x1Before.x, 1);
    expect(x1.at.y).toBeCloseTo(x1Before.y, 1);
    expect(x1.at.x).toBeCloseTo(o2.x, 1);
    const note = next.annotations?.[0] as { at: { x: number; y: number } };
    expect(note.at.y).toBeCloseTo(o2.y + 2, 1);
    expect(validateDiagram(parse(next), FIBA_HALF_COURT)).toEqual([]);
  });

  it("a ball held by the removed player stays where it was, loose", () => {
    const next = removeEntity(base, "o1", FIBA_HALF_COURT);
    const ball = next.entities.find((e) => e.type === "ball") as {
      heldBy?: string;
      at?: { x: number; y: number };
    };
    expect(ball.heldBy).toBeUndefined();
    expect(ball.at).toBeDefined();
    expect(validateDiagram(parse(next), FIBA_HALF_COURT)).toEqual([]);
  });

  it("removing something that isn't there changes nothing", () => {
    expect(removeEntity(base, "nope", FIBA_HALF_COURT).entities).toHaveLength(base.entities.length);
  });
});

describe("builder: courts", () => {
  it("switching to the full court keeps a half-court diagram valid; the far end needs the full court", () => {
    const d = build(["offense", "offense"]);
    expect(
      validateDiagram(parse({ ...d, court: { type: "full", variant: "fiba" } }), FIBA_FULL_COURT),
    ).toEqual([]);
    const far: Diagram = {
      ...d,
      entities: [{ ...(d.entities[0] as object), at: { anchor: "far_top_key" } } as Entity],
    };
    expect(validateDiagram(parse(far), FIBA_HALF_COURT).map((i) => i.code)).toContain(
      "unknown_anchor",
    );
    expect(
      validateDiagram(parse({ ...far, court: { type: "full", variant: "fiba" } }), FIBA_FULL_COURT),
    ).toEqual([]);
  });
});
