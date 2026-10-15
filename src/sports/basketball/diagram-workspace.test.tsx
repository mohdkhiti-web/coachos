import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyOps,
  buildTimeline,
  countInventory,
  DiagramView,
  diagramSchema,
  holdersAtStep,
  resolveDiagram,
  snapPoint,
  stepCountOf,
  validateDiagram,
  type Diagram,
  type DiagramInput,
  type DiagramOp,
} from "@/engines/diagram";
import { getCourtPack } from "@/sports/registry";

/**
 * What the drill workspace added to the diagram engine (Phase 6): equipment, looks, line styles, steps, playback, snapping,
 * copy/paste, the far half court. Everything here is pure — the same functions the editor calls on every click.
 */

const HALF = { type: "half", variant: "fiba" } as const;
const FAR = { type: "half", variant: "fiba_far" } as const;
const pack = getCourtPack("basketball", HALF)!;
const packFor = (c: Diagram["court"]) => getCourtPack("basketball", c);

const base = (extra: Partial<DiagramInput> = {}): DiagramInput => ({
  schemaVersion: 1,
  sport: "basketball",
  court: HALF,
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "top_key" } },
    { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "left_wing" } },
    { id: "b1", type: "ball", heldBy: "o1" },
  ],
  actions: [],
  annotations: [],
  ...extra,
});

function run(ops: DiagramOp[], from: DiagramInput = base()): Diagram {
  const r = applyOps(from, ops, pack, packFor);
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.issues)}`);
  return r.diagram;
}
const refused = (ops: DiagramOp[], from: DiagramInput = base()) => {
  const r = applyOps(from, ops, pack, packFor);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

describe("schema", () => {
  it("still accepts every older diagram unchanged", () => {
    expect(diagramSchema.safeParse(base()).success).toBe(true);
  });

  it("accepts looks, equipment and styled lines, and refuses colours that are not on the palette", () => {
    const ok = diagramSchema.safeParse(
      base({
        entities: [
          {
            id: "e1",
            type: "equipment",
            kind: "ladder",
            at: { x: 0, y: 4 },
            rotation: 90,
            scale: 1.5,
            color: "blue",
          },
          { id: "k1", type: "cone", variant: "tall", label: "3", at: { x: 1, y: 4 } },
        ],
      }),
    );
    expect(ok.success).toBe(true);
    const bad = diagramSchema.safeParse(
      base({
        entities: [{ id: "k1", type: "cone", at: { x: 1, y: 4 }, color: "#ff0000" as never }],
      }),
    );
    expect(bad.success).toBe(false);
  });
});

describe("equipment and looks", () => {
  it("adds equipment and cones with their looks, and never stores a default look", () => {
    const d = run([
      { op: "add_equipment", kind: "hurdle_low", at: { x: 0, y: 5 }, rotation: 0, scale: 1 },
      { op: "add_cone", at: { x: 2, y: 5 }, variant: "disc", color: "green" },
    ]);
    const hurdle = d.entities.find((e) => e.type === "equipment")!;
    expect(hurdle).toMatchObject({ kind: "hurdle_low" });
    expect("rotation" in hurdle).toBe(false);
    expect("scale" in hurdle).toBe(false);
    expect(d.entities.find((e) => e.type === "cone")).toMatchObject({
      variant: "disc",
      color: "green",
    });
  });

  it("styles a mixed selection at once, skipping what does not apply, and clears with null", () => {
    const d = run([
      { op: "add_equipment", kind: "mat", at: { x: 0, y: 5 } },
      { op: "set_props", ids: ["e1", "b1", "o1"], rotation: 45, scale: 2, color: "red" },
    ]);
    expect(d.entities.find((e) => e.id === "e1")).toMatchObject({
      rotation: 45,
      scale: 2,
      color: "red",
    });
    // a ball can be scaled but has no rotation or colour
    const ball = d.entities.find((e) => e.id === "b1")!;
    expect(ball).toMatchObject({ scale: 2 });
    expect("rotation" in ball).toBe(false);
    const cleared = run(
      [{ op: "set_props", ids: ["e1"], color: null, rotation: 0 }],
      d as DiagramInput,
    );
    const e1 = cleared.entities.find((e) => e.id === "e1")!;
    expect("color" in e1).toBe(false);
    expect("rotation" in e1).toBe(false);
  });

  it("counts the equipment on the court", () => {
    const d = run([
      { op: "add_cone", at: { x: 0, y: 5 } },
      { op: "add_cone", at: { x: 1, y: 5 } },
      { op: "add_equipment", kind: "ladder_short", at: { x: 0, y: 6 } },
      { op: "add_ball", at: { x: 3, y: 5 } },
      { op: "add_player", side: "defense", at: { x: 2, y: 8 } },
    ]);
    expect(countInventory(d)).toEqual({
      players: { offense: 2, defense: 1, coaches: 0 },
      items: [
        { key: "ball", count: 2 },
        { key: "cone", count: 2 },
        { key: "ladder", count: 1 },
      ],
    });
  });
});

describe("moving, copying and duplicating", () => {
  it("moves a whole selection by the same amount; a held ball rides with its holder", () => {
    const d = run([{ op: "move_by", ids: ["o1", "o2", "b1"], dx: 1, dy: 2 }]);
    const o1 = resolveDiagram(d, pack).resolved.entities.find((r) => r.entity.id === "o1")!.at;
    const before = resolveDiagram(base() as Diagram, pack).resolved.entities.find(
      (r) => r.entity.id === "o1",
    )!.at;
    expect(o1.x).toBeCloseTo(before.x + 1);
    expect(o1.y).toBeCloseTo(before.y + 2);
    expect(d.entities.find((e) => e.id === "b1")).toMatchObject({ heldBy: "o1" });
  });

  it("duplicates any object, including a ball (a loose copy beside it)", () => {
    const d = run([
      { op: "add_cone", at: { x: 0, y: 5 } },
      { op: "duplicate", id: "k1" },
      { op: "duplicate", id: "b1" },
    ]);
    expect(d.entities.filter((e) => e.type === "cone")).toHaveLength(2);
    const balls = d.entities.filter((e) => e.type === "ball");
    expect(balls).toHaveLength(2);
    expect(balls[1]).toMatchObject({ at: expect.anything() });
  });

  it("pastes a group with new ids and re-points what refers to the copies", () => {
    const start = run([
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2" } },
      { op: "add_cone", at: { x: -3, y: 3 } },
    ]);
    const pasted = run(
      [
        {
          op: "paste",
          entities: start.entities.filter((e) => e.id === "o1" || e.id === "o2" || e.id === "b1"),
          actions: start.actions,
          annotations: [],
          dx: 3,
          dy: 0,
        },
      ],
      start as DiagramInput,
    );
    expect(pasted.entities).toHaveLength(start.entities.length + 3);
    const ids = new Set(pasted.entities.map((e) => e.id));
    expect(ids.size).toBe(pasted.entities.length); // every id is unique
    const passes = pasted.actions.filter((a) => a.type === "pass");
    expect(passes).toHaveLength(2);
    const copy = passes.find((a) => a.type === "pass" && a.from !== "o1")!;
    expect(copy.type === "pass" && ids.has(copy.from) && ids.has(copy.to)).toBe(true);
    // the copied ball is held by the copy of its holder, not by the original
    const copiedBall = pasted.entities.filter((e) => e.type === "ball" && e.id !== "b1")[0]!;
    expect(
      copiedBall.type === "ball" && copiedBall.heldBy && copiedBall.heldBy !== "o1",
    ).toBeTruthy();
  });

  it("a ball pasted without its holder becomes a loose ball where it was", () => {
    const d = run([
      {
        op: "paste",
        entities: base().entities.filter((e) => e.id === "b1"),
        actions: [],
        annotations: [],
        dx: 2,
        dy: 0,
      },
    ]);
    const loose = d.entities.filter((e) => e.type === "ball" && e.id !== "b1")[0]!;
    expect(loose.type === "ball" && !loose.heldBy && loose.at).toBeTruthy();
  });
});

describe("line styles and new actions", () => {
  it("draws a sprint, a defensive slide and every pass style, and refuses a wrong kind", () => {
    const d = run([
      { op: "add_action", action: { type: "sprint", entity: "o2", path: [{ x: 0, y: 3 }] } },
      { op: "add_player", side: "defense", at: { x: 3, y: 6 } },
      {
        op: "add_action",
        action: { type: "defend", kind: "closeout", entity: "x1", path: [{ x: 2, y: 5 }] },
      },
      {
        op: "add_action",
        action: {
          type: "pass",
          from: "o1",
          to: "o2",
          kind: "bounce",
          curve: 0.4,
          weight: "thick",
          color: "blue",
        },
      },
    ]);
    expect(d.actions.map((a) => a.type)).toEqual(["sprint", "defend", "pass"]);
    expect(
      refused([
        {
          op: "add_action",
          action: { type: "defend", kind: "nope" as never, entity: "o1", path: [{ x: 0, y: 3 }] },
        },
      ]),
    ).not.toEqual([]);
  });

  it("changes how a line is drawn without touching what it does, and clears with null", () => {
    const start = run([{ op: "add_action", action: { type: "pass", from: "o1", to: "o2" } }]);
    const styled = run(
      [{ op: "set_action", id: "a1", kind: "skip", curve: -0.3, weight: "thin", color: "purple" }],
      start as DiagramInput,
    );
    expect(styled.actions[0]).toMatchObject({
      type: "pass",
      from: "o1",
      to: "o2",
      kind: "skip",
      curve: -0.3,
      weight: "thin",
      color: "purple",
    });
    const plain = run(
      [{ op: "set_action", id: "a1", curve: null, weight: null, color: null }],
      styled as DiagramInput,
    );
    const a = plain.actions[0]!;
    expect("curve" in a || "weight" in a || "color" in a).toBe(false);
    expect(
      refused([{ op: "set_action", id: "a1", to: { x: 0, y: 0 } }], start as DiagramInput),
    ).toContain("action_invalid");
  });

  it("marks, freehand and coloured notes", () => {
    const d = run([
      { op: "add_mark", kind: "x", at: { x: 1, y: 5 } },
      { op: "add_mark", kind: "check", at: { x: -1, y: 5 }, color: "green" },
      {
        op: "add_freehand",
        points: [
          { x: 0, y: 4 },
          { x: 1, y: 5 },
          { x: 2, y: 4.5 },
        ],
      },
      { op: "add_text", at: { x: 0, y: 8 }, text: "2 dribbles", color: "orange" },
      { op: "move_annotation", index: 0, dx: 0.5, dy: 0.5 },
    ]);
    expect(d.annotations.map((a) => a.type)).toEqual(["mark", "mark", "freehand", "text"]);
    expect(d.annotations[0]).toMatchObject({ at: { x: 1.5, y: 5.5 } });
    expect(refused([{ op: "move_annotation", index: 9, dx: 1, dy: 1 }])).toContain(
      "unknown_annotation",
    );
  });
});

describe("steps", () => {
  const twoSteps = () =>
    run([
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -2, y: 2 }], step: 1 } },
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2", step: 2 } },
    ]);

  it("a step is where the previous one left everybody, and possession follows passes", () => {
    const d = twoSteps();
    const { resolved } = resolveDiagram(d, pack);
    expect(resolved.steps).toEqual([1, 2]);
    expect(resolved.stepStarts.get(2)!.get("o2")).toEqual({ x: -2, y: 2 });
    expect(resolved.stepStarts.get(0)!.get("o2")).toEqual({ x: -2, y: 2 });
    expect(holdersAtStep(d, 1).get("b1")).toBe("o1");
    expect(holdersAtStep(d, 2).get("b1")).toBe("o1");
    expect(holdersAtStep(d, 3).get("b1")).toBe("o2"); // after the pass in step 2
  });

  it("adds, duplicates, moves, names and removes steps", () => {
    let d = twoSteps();
    expect(stepCountOf(d)).toBe(2);
    d = run([{ op: "add_step" }], d as DiagramInput);
    expect(stepCountOf(d)).toBe(3);
    expect(resolveDiagram(d, pack).resolved.steps).toEqual([1, 2, 3]); // an empty step is still a step

    d = run([{ op: "set_step_title", step: 1, title: "Cut to the wing" }], d as DiagramInput);
    d = run([{ op: "duplicate_step", step: 1 }], d as DiagramInput);
    expect(stepCountOf(d)).toBe(4);
    expect(d.stepTitles).toEqual({ "1": "Cut to the wing", "2": "Cut to the wing" });
    expect(d.actions.find((a) => a.type === "pass")!.step).toBe(3); // the pass moved from step 2 to 3

    d = run([{ op: "remove_step", step: 2 }], d as DiagramInput);
    expect(stepCountOf(d)).toBe(3);
    expect(d.actions.find((a) => a.type === "pass")!.step).toBe(2);
    expect(refused([{ op: "remove_step", step: 1 }], base())).toContain("last_step");
  });

  it("reorders steps and refuses an order that breaks the rules of the drill", () => {
    const d = twoSteps();
    // the pass needs the ball with o1 — true in either order, so swapping is fine
    const swapped = run([{ op: "move_step", step: 2, to: 1 }], d as DiagramInput);
    expect(swapped.actions.find((a) => a.type === "pass")!.step).toBe(1);
    expect(swapped.actions.find((a) => a.type === "cut")!.step).toBe(2);
    // the maximum is enforced
    let many: DiagramInput = base();
    for (let i = 0; i < 11; i++) many = run([{ op: "add_step" }], many) as DiagramInput;
    expect(refused([{ op: "add_step" }], many)).toContain("too_many_steps");
  });
});

describe("the court", () => {
  it("switching to the far half turns the drawing half a turn so it keeps its place", () => {
    const d = run([
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -2, y: 2 }] } },
      { op: "add_cone", at: { x: 3, y: 4 } },
      { op: "set_court", court: "half_far" },
    ]);
    expect(d.court).toEqual(FAR);
    const far = packFor(FAR)!;
    expect(validateDiagram(d, far)).toEqual([]);
    const cone = d.entities.find((e) => e.type === "cone")!;
    // near (3, 4) → far (-3, 24.85 - 4)
    expect(cone.at).toEqual({ x: -3, y: 20.85 });
    // and back again
    const back = applyOps(d, [{ op: "set_court", court: "half" }], far, packFor);
    expect(back.ok && back.diagram.entities.find((e) => e.type === "cone")!.at).toEqual({
      x: 3,
      y: 4,
    });
  });

  it("the far half court has the same named spots, at the far basket, and shots go to that basket", () => {
    const far = packFor(FAR)!;
    expect(Object.keys(far.anchors).sort()).toEqual(Object.keys(pack.anchors).sort());
    expect(far.primaryTarget.y).toBeGreaterThan(20);
    expect(far.anchors.top_key!.y).toBeCloseTo(24.85 - pack.anchors.top_key!.y);
    const d = run([
      { op: "set_court", court: "half_far" },
      { op: "add_action", action: { type: "shot", entity: "o1" } },
    ]);
    expect(resolveDiagram(d, far).resolved.actions[0]!.points[1]!.y).toBeCloseTo(
      far.primaryTarget.y,
    );
  });
});

describe("playback", () => {
  const drill = () =>
    run([
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -1, y: 3 }], step: 1 } },
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2", step: 1 } },
      { op: "add_action", action: { type: "shot", entity: "o2", step: 2 } },
    ]);

  it("plays the drawn movement: start where they start, end where the paths end", () => {
    const d = drill();
    const tl = buildTimeline(d, pack);
    expect(tl.duration).toBeGreaterThan(1);
    expect(tl.spans.map((s) => s.step)).toEqual([1, 2]);
    const first = tl.frameAt(0);
    const start = resolveDiagram(d, pack).resolved.entities.find((r) => r.entity.id === "o2")!.at;
    expect(first.positions.get("o2")).toEqual(start);
    const last = tl.frameAt(tl.duration);
    const end = last.positions.get("o2")!;
    expect(end.x).toBeCloseTo(-1);
    expect(end.y).toBeCloseTo(3);
  });

  it("the ball is passed to the receiver, travels with them, then goes to the basket", () => {
    const d = drill();
    const tl = buildTimeline(d, pack);
    const step1 = tl.spans[0]!;
    const during = tl.frameAt(step1.start + 0.5);
    expect(during.visibleActions.has("a1")).toBe(true);
    // at the end of step 1 the ball is beside o2, not o1
    const after = tl.frameAt(step1.end - 0.01);
    const ball = after.positions.get("b1")!;
    const o2 = after.positions.get("o2")!;
    expect(Math.hypot(ball.x - o2.x - 0.46, ball.y - o2.y + 0.4)).toBeLessThan(0.01);
    // the shot ends at the basket
    const end = tl.frameAt(tl.duration).positions.get("b1")!;
    expect(end).toEqual({ x: pack.primaryTarget.x, y: pack.primaryTarget.y });
  });

  it("a diagram with no actions has nothing to play", () => {
    const tl = buildTimeline(base() as Diagram, pack);
    expect(tl.duration).toBe(0);
    expect(tl.frameAt(5).positions.get("o1")).toBeDefined();
  });
});

describe("snapping", () => {
  const opts = { grid: 0.5 as const, courtLines: true, objects: true, radius: 0.4 };
  it("a named court spot pulls the object onto it", () => {
    const r = snapPoint({ x: 0.1, y: 7.3 }, pack, [], opts);
    expect(r.point).toEqual(pack.anchors.top_key);
    expect(r.guides[0]).toMatchObject({ kind: "spot", name: "top_key" });
  });
  it("lines up with another object's row or column, and falls back to the grid", () => {
    const r = snapPoint({ x: 3.2, y: 9.1 }, pack, [{ x: 3.05, y: 2 }], {
      ...opts,
      courtLines: false,
    });
    expect(r.point.x).toBe(3.05);
    expect(r.guides.some((g) => g.kind === "object" && g.axis === "x")).toBe(true);
    expect(r.point.y).toBe(9); // the grid took the other axis
  });
  it("does nothing when everything is off, and never leaves the court", () => {
    const off = { grid: false as const, courtLines: false, objects: false, radius: 0.4 };
    expect(snapPoint({ x: 1.234, y: 5.678 }, pack, [], off).point).toEqual({ x: 1.23, y: 5.68 });
    expect(snapPoint({ x: 99, y: -99 }, pack, [], off).point).toEqual({
      x: pack.bounds.maxX,
      y: pack.bounds.minY,
    });
  });
});

describe("rendering", () => {
  const markup = (d: DiagramInput, props: object = {}) =>
    renderToStaticMarkup(<DiagramView diagram={diagramSchema.parse(d)} pack={pack} {...props} />);

  it("draws equipment, cone variants, marks and styled lines", () => {
    const d = run([
      { op: "add_equipment", kind: "ladder", at: { x: 0, y: 4 }, rotation: 90 },
      { op: "add_equipment", kind: "hoop", at: { x: 5, y: 8 } },
      { op: "add_cone", at: { x: 1, y: 5 }, variant: "disc", label: "2" },
      { op: "add_mark", kind: "check", at: { x: 2, y: 5 } },
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2", kind: "bounce" } },
      {
        op: "add_action",
        action: { type: "defend", kind: "closeout", entity: "o2", path: [{ x: 1, y: 3 }] },
      },
    ]);
    const html = markup(d);
    expect(html).toContain("rotate(90)");
    expect(html).toContain("closeout");
    expect(html).toContain("<circle"); // the bounce ring, the rim, the disc cone
    expect(html).toContain('data-action="a1"');
  });

  it("shows one step: everyone where it starts, later steps hidden, earlier steps faint", () => {
    const d = run([
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -2, y: 2 }], step: 1 } },
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2", step: 2 } },
    ]);
    const s1 = markup(d, { step: 1 });
    expect(s1).toContain('data-action="a1"');
    expect(s1).not.toContain('data-action="a2"');
    const s2 = markup(d, { step: 2 });
    expect(s2).toContain('data-action="a2"');
    expect(s2).toContain('opacity="0.28"'); // step 1's cut, faint
  });

  it("an older diagram renders exactly as it did before the workspace existed", () => {
    // no new attribute leaks into legacy markup
    const html = markup(base());
    for (const forbidden of ["rotate(", "scale(", "opacity=", "paintOrder", "paint-order"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
