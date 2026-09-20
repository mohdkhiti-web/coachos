import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  describeDiagram,
  diagramSchema,
  parseDiagram,
  resolveDiagram,
  validateDiagram,
  DiagramView,
} from "./index";
import type { CourtPack, Diagram, DiagramInput } from "./index";

/**
 * The engine knows NOTHING about basketball. These tests run it on a toy 10 m × 10 m field to prove
 * that a new sport only has to supply a CourtPack (ARCHITECTURE.md §8.3, §10.4).
 */
const TOY: CourtPack = {
  id: "toy.field",
  label: "Toy field",
  bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
  margin: 1,
  tolerance: 0.5,
  anchors: {
    centre: { x: 5, y: 5 },
    north: { x: 5, y: 1 },
    south: { x: 5, y: 9 },
    east: { x: 9, y: 5 },
  },
  primaryTarget: { x: 5, y: 0 },
  primitives: [{ d: "M 0 0 H 10 V 10 H 0 Z", stroke: "line" }],
  actions: ["pass", "cut", "move", "dribble", "shot"], // no "screen" on the toy field
  source: { name: "toy", crossChecked: [], unverified: [] },
};

const make = (over: Partial<DiagramInput> = {}): Diagram =>
  diagramSchema.parse({
    schemaVersion: 1,
    sport: "toy",
    court: { type: "half", variant: "toy" },
    entities: [
      { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "south" } },
      { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "east" } },
      {
        id: "x1",
        type: "player",
        side: "defense",
        label: "X1",
        at: { entity: "o1", offset: [0, -1.2] },
      },
      { id: "b1", type: "ball", heldBy: "o1" },
    ],
    actions: [
      { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
      { id: "a2", step: 2, type: "cut", entity: "o1", path: [{ anchor: "north" }] },
    ],
    ...over,
  });

const codes = (d: Diagram) => validateDiagram(d, TOY).map((i) => i.code);

describe("schema", () => {
  it("accepts a well-formed diagram and applies defaults (step, empty annotations)", () => {
    const d = diagramSchema.parse({
      schemaVersion: 1,
      sport: "toy",
      court: { type: "half", variant: "toy" },
      entities: [],
    });
    expect(d.actions).toEqual([]);
    expect(d.annotations).toEqual([]);
    const withAction = make({
      actions: [{ id: "a1", type: "pass", from: "o1", to: "o2" } as never],
    });
    expect(withAction.actions[0]?.step).toBe(1);
  });

  it("is strict: unknown keys, unknown types and bad ids are rejected", () => {
    const base = {
      schemaVersion: 1,
      sport: "toy",
      court: { type: "half", variant: "toy" },
      entities: [],
    };
    expect(diagramSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(diagramSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(false);
    expect(
      diagramSchema.safeParse({
        ...base,
        entities: [{ id: "1bad", type: "cone", at: { x: 1, y: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      diagramSchema.safeParse({
        ...base,
        entities: [{ id: "z", type: "wizard", at: { x: 1, y: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      diagramSchema.safeParse({
        ...base,
        entities: [{ id: "c", type: "cone", at: { x: Infinity, y: 1 } }],
      }).success,
    ).toBe(false);
  });

  it("enforces size limits", () => {
    const many = Array.from({ length: 31 }, (_, i) => ({
      id: `c${i}`,
      type: "cone",
      at: { x: 1, y: 1 },
    }));
    expect(
      diagramSchema.safeParse({
        schemaVersion: 1,
        sport: "toy",
        court: { type: "half", variant: "toy" },
        entities: many,
      }).success,
    ).toBe(false);
  });

  it("parseDiagram runs the version migration path and rejects unknown versions", () => {
    expect(parseDiagram(make()).success).toBe(true);
    expect(parseDiagram({ ...make(), schemaVersion: 99 }).success).toBe(false);
    expect(parseDiagram("not a diagram").success).toBe(false);
  });
});

describe("resolution", () => {
  it("resolves anchors, offsets and entity-relative positions to metres", () => {
    const { resolved, issues } = resolveDiagram(make(), TOY);
    expect(issues).toEqual([]);
    const at = (id: string) => resolved.entities.find((e) => e.entity.id === id)?.at;
    expect(at("o1")).toEqual({ x: 5, y: 9 });
    expect(at("x1")).toEqual({ x: 5, y: 9 - 1.2 });
  });

  it("derives positions by step: a cut moves the player for later steps", () => {
    const d = make({
      actions: [
        { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
        { id: "a2", step: 1, type: "cut", entity: "o1", path: [{ anchor: "north" }] },
        { id: "a3", step: 2, type: "pass", from: "o2", to: "o1" }, // must point at o1's NEW position
      ],
    });
    const { resolved } = resolveDiagram(d, TOY);
    const last = resolved.actions.find((a) => a.action.id === "a3");
    expect(last?.points[1]).toEqual({ x: 5, y: 1 });
    expect(resolved.steps).toEqual([1, 2]);
  });

  it("reports unknown anchors/entities and rejects chained relative positions", () => {
    const d = make({
      entities: [
        { id: "o1", type: "player", side: "offense", at: { anchor: "nowhere" } },
        { id: "o2", type: "player", side: "offense", at: { entity: "o3" } },
        { id: "o3", type: "player", side: "offense", at: { entity: "o2" } },
      ],
      actions: [],
    });
    const c = resolveDiagram(d, TOY).issues.map((i) => i.code);
    expect(c).toContain("unknown_anchor");
    expect(c).toContain("nested_reference");
  });
});

describe("semantic validation", () => {
  it("passes a coherent diagram", () => {
    expect(codes(make())).toEqual([]);
  });

  it("catches dangling references and duplicate ids", () => {
    const d = make({ actions: [{ id: "a1", step: 1, type: "pass", from: "o1", to: "ghost" }] });
    expect(codes(d)).toContain("unknown_entity");
    const dup = make({
      entities: [
        { id: "o1", type: "player", side: "offense", at: { anchor: "south" } },
        { id: "o1", type: "player", side: "offense", at: { anchor: "east" } },
      ],
      actions: [],
    });
    expect(codes(dup)).toContain("duplicate_id");
  });

  it("puts everything on the field: out-of-bounds entities and paths are rejected", () => {
    const off = make({
      entities: [{ id: "o1", type: "player", side: "offense", at: { x: 40, y: 3 } }],
      actions: [],
    });
    expect(codes(off)).toContain("out_of_bounds");
    const path = make({
      actions: [{ id: "a1", step: 1, type: "move", entity: "o2", path: [{ x: 5, y: 30 }] }],
    });
    expect(codes(path)).toContain("out_of_bounds");
  });

  it("only allows the actions the sport's pack offers", () => {
    const d = make({
      actions: [{ id: "a1", step: 1, type: "screen", entity: "o1", target: { entity: "x1" } }],
    });
    expect(codes(d)).toContain("action_not_allowed");
  });

  it("enforces roles: cones and balls can't pass or move", () => {
    const d = make({
      entities: [
        { id: "o1", type: "player", side: "offense", at: { anchor: "south" } },
        { id: "c1", type: "cone", at: { anchor: "north" } },
      ],
      actions: [{ id: "a1", step: 1, type: "move", entity: "c1", path: [{ anchor: "centre" }] }],
    });
    expect(codes(d)).toContain("invalid_actor");
  });

  it("possession: a pass or dribble needs the ball, and a pass moves it at the end of the step", () => {
    expect(
      codes(make({ actions: [{ id: "a1", step: 1, type: "pass", from: "o2", to: "o1" }] })),
    ).toContain("action_requires_ball");
    // o1 passes to o2 in step 1, so o2 may pass in step 2 …
    expect(
      codes(
        make({
          actions: [
            { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
            { id: "a2", step: 2, type: "pass", from: "o2", to: "o1" },
          ],
        }),
      ),
    ).toEqual([]);
    // … but not in the same step it receives.
    expect(
      codes(
        make({
          actions: [
            { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
            { id: "a2", step: 1, type: "pass", from: "o2", to: "o1" },
          ],
        }),
      ),
    ).toContain("action_requires_ball");
    expect(
      codes(
        make({
          actions: [
            { id: "a1", step: 1, type: "dribble", entity: "o2", path: [{ anchor: "centre" }] },
          ],
        }),
      ),
    ).toContain("action_requires_ball");
  });

  it("balls need exactly one of heldBy/at, a valid holder, and no two balls per holder", () => {
    const both = make({
      entities: [
        { id: "o1", type: "player", side: "offense", at: { anchor: "south" } },
        { id: "b1", type: "ball" },
      ],
      actions: [],
    });
    expect(codes(both)).toContain("ball_needs_holder_or_position");
    const cone = make({
      entities: [
        { id: "c1", type: "cone", at: { anchor: "north" } },
        { id: "b1", type: "ball", heldBy: "c1" },
      ],
      actions: [],
    });
    expect(codes(cone)).toContain("ball_holder_invalid");
    const shared = make({
      entities: [
        { id: "o1", type: "player", side: "offense", at: { anchor: "south" } },
        { id: "b1", type: "ball", heldBy: "o1" },
        { id: "b2", type: "ball", heldBy: "o1" },
      ],
      actions: [],
    });
    expect(codes(shared)).toContain("ball_holder_shared");
  });
});

describe("description (alt text)", () => {
  it("summarises the cast and each step in plain language", () => {
    const text = describeDiagram(make());
    expect(text).toContain("2 offensive players");
    expect(text).toContain("1 defender");
    expect(text).toContain("Step 1: player 1 passes to player 2");
    expect(text).toContain("Step 2: player 1 cuts to the north");
  });
});

describe("rendering", () => {
  it("renders a labelled, accessible SVG", () => {
    const html = renderToStaticMarkup(
      <DiagramView diagram={make()} pack={TOY} title="Toy drill" />,
    );
    expect(html).toMatch(/^<svg/);
    expect(html).toContain('role="img"');
    expect(html).toContain("<title");
    expect(html).toContain("Toy drill");
    expect(html).toContain("passes to player 2"); // <desc>
    expect(html).toContain('viewBox="-1 -1 12 12"');
  });

  it("is deterministic (stable output for golden tests and exports)", () => {
    const a = renderToStaticMarkup(<DiagramView diagram={make()} pack={TOY} />).replace(
      /:R[^:]*:/g,
      "ID",
    );
    const b = renderToStaticMarkup(<DiagramView diagram={make()} pack={TOY} />).replace(
      /:R[^:]*:/g,
      "ID",
    );
    expect(a).toBe(b);
  });

  it("decorative diagrams are hidden from assistive technology and carry no title", () => {
    const html = renderToStaticMarkup(<DiagramView diagram={make()} pack={TOY} decorative />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<title");
    expect(html).not.toContain('role="img"');
  });

  it("never emits NaN/Infinity, and uses fixed colours for print/mono themes", () => {
    const d = make({
      annotations: [
        { type: "zone_rect", from: { x: 1, y: 1 }, to: { x: 3, y: 3 }, label: "Zone" },
        { type: "zone_circle", center: { anchor: "centre" }, radius: 1.5 },
        { type: "text", at: { x: 5, y: 7 }, text: "Note" },
      ],
    });
    for (const theme of ["screen", "print", "mono"] as const) {
      const html = renderToStaticMarkup(<DiagramView diagram={d} pack={TOY} theme={theme} />);
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      if (theme !== "screen") expect(html).not.toContain("var(--");
    }
  });

  it("draws every action style and entity type without error", () => {
    const d = make({
      entities: [
        { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "south" } },
        { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "east" } },
        { id: "x1", type: "player", side: "defense", label: "X1", at: { anchor: "centre" } },
        { id: "co", type: "coach", at: { x: 1, y: 9 } },
        { id: "c1", type: "cone", at: { x: 2, y: 2 } },
        { id: "m1", type: "marker", kind: "start", at: { x: 8, y: 8 } },
        { id: "b1", type: "ball", heldBy: "o1" },
      ],
      actions: [
        { id: "a1", step: 1, type: "dribble", entity: "o1", path: [{ anchor: "centre" }] },
        {
          id: "a2",
          step: 1,
          type: "cut",
          entity: "o2",
          path: [
            { x: 7, y: 3 },
            { x: 8, y: 2 },
          ],
        },
        { id: "a3", step: 2, type: "pass", from: "o1", to: "o2" },
        { id: "a4", step: 3, type: "shot", entity: "o2" },
      ],
    });
    expect(codes(d)).toEqual([]);
    const html = renderToStaticMarkup(<DiagramView diagram={d} pack={TOY} />);
    expect(html).toContain("<polygon"); // arrowheads
    expect(html).toContain("<circle");
    expect(html).toContain("<rect");
  });
});
