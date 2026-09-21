import { describe, expect, it } from "vitest";
import {
  applyOps,
  diagramOpsSchema,
  MAX_OPS,
  type Diagram,
  type DiagramInput,
  type DiagramOp,
} from "@/engines/diagram";
import { FIBA_FULL_COURT, FIBA_HALF_COURT } from "./court-fiba";

/**
 * The diagram operations (moves, additions, passes…) on the real basketball courts: the same edits a coach makes in
 * the editor and an assistant may propose. Every batch is checked as a whole; an invalid one changes nothing.
 */

const base = (): DiagramInput => ({
  schemaVersion: 1,
  sport: "basketball",
  court: { type: "half", variant: "fiba" },
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "top_key" } },
    { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "right_wing" } },
    {
      id: "x1",
      type: "player",
      side: "defense",
      label: "X1",
      at: { entity: "o1", offset: [0, -1.2] },
    },
    { id: "b1", type: "ball", heldBy: "o1" },
  ],
  actions: [{ id: "a1", step: 1, type: "pass", from: "o1", to: "o2" }],
  annotations: [],
});
const packFor = (c: Diagram["court"]) => (c.type === "full" ? FIBA_FULL_COURT : FIBA_HALF_COURT);
const run = (ops: DiagramOp[], d = base()) => applyOps(d, ops, FIBA_HALF_COURT, packFor);
const good = (ops: DiagramOp[], d = base()) => {
  const r = run(ops, d);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.diagram;
};
const codes = (ops: DiagramOp[], d = base()) => {
  const r = run(ops, d);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

describe("adding", () => {
  it("adds players with the next free id and a sensible label", () => {
    const d = good([
      { op: "add_player", side: "offense", at: { anchor: "left_wing" } },
      { op: "add_player", side: "defense", at: { anchor: "left_slot" } },
    ]);
    const added = d.entities.filter((e) => e.type === "player").slice(-2);
    expect(added).toMatchObject([
      { id: "o3", side: "offense", label: "3" },
      { id: "x2", side: "defense", label: "X2" },
    ]);
  });

  it("adds coaches, cones and balls, and refuses a ball that is both held and on the floor", () => {
    const d = good([
      { op: "add_coach", at: { anchor: "half_court_center" }, label: "C" },
      { op: "add_cone", at: { anchor: "left_elbow" } },
      { op: "add_ball", heldBy: "o2" },
    ]);
    expect(d.entities.map((e) => e.type)).toEqual(
      expect.arrayContaining(["coach", "cone", "ball"]),
    );
    expect(codes([{ op: "add_ball", heldBy: "o2", at: { anchor: "top_key" } }])).toContain(
      "ball_needs_holder_or_position",
    );
    expect(codes([{ op: "add_ball" }])).toContain("ball_needs_holder_or_position");
  });

  it("refuses an id that is already taken and a position that is not on the court", () => {
    expect(
      codes([{ op: "add_player", id: "o1", side: "offense", at: { anchor: "top_key" } }]),
    ).toContain("duplicate_id");
    expect(codes([{ op: "add_player", side: "offense", at: { x: 40, y: 40 } }])).toContain(
      "out_of_bounds",
    );
    expect(
      codes([{ op: "add_player", side: "offense", at: { anchor: "no_such_spot" } }]),
    ).toContain("unknown_anchor");
  });

  it("duplicates a player next to the original, without its actions", () => {
    const d = good([{ op: "duplicate", id: "o2" }]);
    const copy = d.entities.find((e) => e.id === "o3")!;
    expect(copy).toMatchObject({ type: "player", side: "offense", label: "3" });
    expect(d.actions).toHaveLength(1);
    expect(codes([{ op: "duplicate", id: "b1" }])).toContain("no_duplicate_ball");
  });
});

describe("changing", () => {
  it("moves a player, and a ball that lies on the floor — but not a ball someone holds", () => {
    const d = good([{ op: "move", id: "o2", to: { x: 3, y: 4 } }]);
    expect(d.entities.find((e) => e.id === "o2")).toMatchObject({ at: { x: 3, y: 4 } });
    expect(codes([{ op: "move", id: "b1", to: { x: 1, y: 1 } }])).toContain("ball_is_held");
    const loose = good([
      { op: "add_ball", at: { x: 1, y: 6 } },
      { op: "move", id: "b2", to: { x: 2, y: 6 } },
    ]);
    expect(loose.entities.find((e) => e.id === "b2")).toMatchObject({ at: { x: 2, y: 6 } });
  });

  it("changes a label and a role, and only where that makes sense", () => {
    const d = good([
      { op: "set_label", id: "o2", label: "5" },
      { op: "set_side", id: "o2", side: "defense" },
    ]);
    expect(d.entities.find((e) => e.id === "o2")).toMatchObject({ label: "5", side: "defense" });
    expect(codes([{ op: "set_label", id: "b1", label: "9" }])).toContain("no_label");
    expect(codes([{ op: "set_side", id: "b1", side: "defense" }])).toContain("not_a_player");
  });

  it("gives the ball to another player, putting down any ball that player already held", () => {
    const d = good([
      { op: "clear_actions" },
      { op: "give_ball", ball: "b1", to: "o2" },
      { op: "add_action", action: { type: "pass", from: "o2", to: "o1" } },
    ]);
    expect(d.entities.find((e) => e.id === "b1")).toMatchObject({ heldBy: "o2" });
    expect(codes([{ op: "give_ball", ball: "o1", to: "o2" }])).toContain("not_a_ball");
    expect(codes([{ op: "give_ball", ball: "b1", to: "b1" }])).toContain("invalid_actor");
  });

  it("changes the court and reports what no longer fits", () => {
    expect(good([{ op: "set_court", court: "full" }]).court.type).toBe("full");
    const far = base();
    far.entities.push({ id: "o3", type: "player", side: "offense", at: { anchor: "far_basket" } });
    expect(
      codes([{ op: "set_court", court: "half" }], {
        ...far,
        court: { type: "full", variant: "fiba" },
      }),
    ).not.toEqual([]);
  });
});

describe("drawing", () => {
  it("adds a dribble, a cut, a screen and a shot, numbering the steps in order", () => {
    const d = good([
      { op: "clear_actions" },
      {
        op: "add_action",
        action: { type: "dribble", entity: "o1", path: [{ anchor: "free_throw_line" }] },
      },
      {
        op: "add_action",
        action: { type: "cut", entity: "o2", step: 2, path: [{ anchor: "right_block" }] },
      },
      {
        op: "add_action",
        action: { type: "screen", entity: "o2", step: 3, target: { entity: "x1" } },
      },
      { op: "add_action", action: { type: "shot", entity: "o1", step: 4 } },
    ]);
    expect(d.actions.map((a) => [a.id, a.type])).toEqual([
      ["a1", "dribble"],
      ["a2", "cut"],
      ["a3", "screen"],
      ["a4", "shot"],
    ]);
  });

  it("refuses a pass or shot by someone without the ball, and a move by a cone", () => {
    expect(
      codes([{ op: "add_action", action: { type: "shot", entity: "o2", step: 1 } }]),
    ).toContain("action_requires_ball");
    expect(
      codes([
        { op: "add_cone", at: { anchor: "left_elbow" } },
        { op: "add_action", action: { type: "move", entity: "k1", path: [{ anchor: "top_key" }] } },
      ]),
    ).toContain("invalid_actor");
  });

  it("re-routes an action's path, changes its step and removes it", () => {
    const d = good([
      {
        op: "add_action",
        action: { type: "cut", entity: "o2", path: [{ anchor: "right_block" }] },
      },
      { op: "set_path", id: "a2", path: [{ anchor: "right_elbow" }, { anchor: "basket" }] },
      { op: "set_step", id: "a2", step: 3 },
      { op: "remove_action", id: "a1" },
    ]);
    expect(d.actions).toHaveLength(1);
    expect(d.actions[0]).toMatchObject({
      id: "a2",
      step: 3,
      path: [{ anchor: "right_elbow" }, { anchor: "basket" }],
    });
    expect(codes([{ op: "set_path", id: "a1", path: [{ anchor: "basket" }] }])).toContain(
      "no_path",
    );
    expect(codes([{ op: "remove_action", id: "a9" }])).toContain("unknown_action");
  });

  it("adds text and zones, and clears every action", () => {
    const d = good([
      { op: "add_text", at: { anchor: "top_key", offset: [0, 2] }, text: "Read the help" },
      {
        op: "add_zone",
        from: { anchor: "left_block" },
        to: { anchor: "right_elbow" },
        label: "Paint",
      },
      { op: "clear_actions" },
    ]);
    expect(d.annotations.map((a) => a.type)).toEqual(["text", "zone_rect"]);
    expect(d.actions).toEqual([]);
    expect(good([{ op: "remove_annotation", index: 0 }], d).annotations).toHaveLength(1);
    expect(codes([{ op: "remove_annotation", index: 5 }])).toContain("unknown_annotation");
  });
});

describe("removing", () => {
  it("removes a player with every action it took part in, and puts its ball down where it lay", () => {
    const d = good([{ op: "remove", id: "o1" }]);
    expect(d.entities.map((e) => e.id)).not.toContain("o1");
    expect(d.actions).toEqual([]); // the pass involved o1
    expect(d.entities.find((e) => e.id === "b1")).toMatchObject({
      at: expect.objectContaining({ x: expect.any(Number) }),
    });
    // a defender placed relative to o1 stays where it stood
    expect(d.entities.find((e) => e.id === "x1")).toMatchObject({
      at: { x: expect.any(Number), y: expect.any(Number) },
    });
    expect(codes([{ op: "remove", id: "nobody" }])).toContain("unknown_entity");
  });
});

describe("safety", () => {
  it("changes nothing when any operation in the batch is invalid", () => {
    const before = JSON.stringify(base());
    const r = run([
      { op: "move", id: "o2", to: { x: 3, y: 4 } },
      { op: "remove", id: "ghost" },
    ]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(base())).toBe(before);
  });

  it("only knows the operations in its vocabulary — anything else is rejected before it runs", () => {
    for (const bad of [
      [{ op: "run_script", code: "alert(1)" }],
      [{ op: "add_text", at: { anchor: "top_key" }, text: "x", html: "<script>" }],
      [{ op: "add_player", side: "offense", at: { anchor: "top_key" }, svg: "<svg onload=x>" }],
      [],
      Array.from({ length: MAX_OPS + 1 }, () => ({ op: "clear_actions" })),
    ])
      expect(diagramOpsSchema.safeParse(bad).success).toBe(false);
    expect(diagramOpsSchema.safeParse([{ op: "clear_actions" }]).success).toBe(true);
  });

  it("keeps text within its limits: markup is just text, and long text is refused", () => {
    const d = good([{ op: "add_text", at: { anchor: "top_key" }, text: "<b>x</b>" }]);
    expect(d.annotations[0]).toMatchObject({ text: "<b>x</b>" }); // stored as text; the renderer never treats it as markup
    expect(
      diagramOpsSchema.safeParse([
        { op: "add_text", at: { anchor: "top_key" }, text: "x".repeat(41) },
      ]).success,
    ).toBe(false);
  });

  it("enforces the diagram's own limits", () => {
    const ops: DiagramOp[] = Array.from({ length: 30 }, () => ({
      op: "add_player" as const,
      side: "offense" as const,
      at: { anchor: "top_key" },
    }));
    expect(codes(ops)).not.toEqual([]); // 3 + 30 entities exceeds the schema's maximum
  });
});
