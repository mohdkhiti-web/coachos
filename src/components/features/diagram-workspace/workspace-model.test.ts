import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import {
  applyOps,
  diagramSchema,
  EQUIPMENT_KINDS,
  resolveDiagram,
  validateDiagram,
  type Diagram,
  type DiagramInput,
  type DiagramOp,
} from "@/engines/diagram";
import { BASKETBALL_DIAGRAM_TEMPLATES } from "@/sports/basketball/diagram-templates";
import { getCourtPack } from "@/sports/registry";
import {
  defaultSpot,
  placeOps,
  searchTools,
  TOOLS,
  TOOL_BY_ID,
  TOOL_CATEGORIES,
  toolsIn,
} from "./tools";
import {
  buildFragment,
  buildScene,
  clampView,
  courtBox,
  deleteOps,
  dragOps,
  fitToContent,
  hitTest,
  marqueeSelect,
  NO_SELECTION,
  panBy,
  pruneSelection,
  rotateOps,
  selectHit,
  viewBoxString,
  visibleBox,
  wholeCourt,
  zoomAt,
} from "./workspace-model";
import { historyReducer, MAX_HISTORY } from "./use-history";

const HALF = { type: "half", variant: "fiba" } as const;
const pack = getCourtPack("basketball", HALF)!;
const packFor = (c: Diagram["court"]) => getCourtPack("basketball", c);
const messages = en.diagramWorkspace as unknown as Record<string, Record<string, string>>;

const base = (): DiagramInput => ({
  schemaVersion: 1,
  sport: "basketball",
  court: HALF,
  entities: [
    { id: "o1", type: "player", side: "offense", label: "1", at: { x: 0, y: 7 } },
    { id: "o2", type: "player", side: "offense", label: "2", at: { x: -4, y: 5 } },
    { id: "b1", type: "ball", heldBy: "o1" },
    { id: "e1", type: "equipment", kind: "ladder", at: { x: 3, y: 9 }, rotation: 90 },
    { id: "k1", type: "cone", at: { x: 5, y: 3 } },
  ],
  actions: [],
  annotations: [{ type: "text", at: { x: -3, y: 10 }, text: "Cut" }],
});
const run = (from: DiagramInput, ops: DiagramOp[]): Diagram => {
  const r = applyOps(from, ops, pack, packFor);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.diagram;
};
const start = () => diagramSchema.parse(base());
const sceneOf = (d: Diagram, step = 1) => buildScene(d, pack, step);

describe("diagram templates", () => {
  it("every template is a valid diagram on its own court, with a name", () => {
    expect(BASKETBALL_DIAGRAM_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    const keys = new Set<string>();
    for (const tpl of BASKETBALL_DIAGRAM_TEMPLATES) {
      expect(keys.has(tpl.key), `duplicate key ${tpl.key}`).toBe(false);
      keys.add(tpl.key);
      const parsed = diagramSchema.safeParse(tpl.diagram);
      expect(parsed.success, tpl.key).toBe(true);
      if (!parsed.success) continue;
      const courtPack = getCourtPack(parsed.data.sport, parsed.data.court);
      expect(courtPack, `${tpl.key} court`).toBeDefined();
      expect(validateDiagram(parsed.data, courtPack!), tpl.key).toEqual([]);
      expect(messages.templates![tpl.key], `messages: templates.${tpl.key}`).toBeTruthy();
    }
  });

  it("a template is only positions and lines: nothing that looks like drill content", () => {
    for (const tpl of BASKETBALL_DIAGRAM_TEMPLATES)
      expect(Object.keys(tpl.diagram).sort()).toEqual(
        ["actions", "annotations", "court", "entities", "schemaVersion", "sport"].sort(),
      );
  });
});

describe("the tool library", () => {
  it("has unique tools, each named in the messages, in a known category", () => {
    const ids = new Set<string>();
    for (const tool of TOOLS) {
      expect(ids.has(tool.id), `duplicate tool ${tool.id}`).toBe(false);
      ids.add(tool.id);
      expect(messages.tools![tool.id], `messages: tools.${tool.id}`).toBeTruthy();
      expect(TOOL_CATEGORIES).toContain(tool.category);
      expect(Boolean(tool.place) !== Boolean(tool.draw), `${tool.id} is place XOR draw`).toBe(true);
    }
    for (const c of TOOL_CATEGORIES) expect(toolsIn(c).length, `category ${c}`).toBeGreaterThan(0);
    for (const c of ["all", ...TOOL_CATEGORIES]) expect(messages.categories![c]).toBeTruthy();
  });

  it("offers every piece of equipment in the registry, and the messages name it", () => {
    const offered = new Set(
      TOOLS.flatMap((t) => (t.place?.kind === "equipment" ? [t.place.equipment] : [])),
    );
    for (const kind of EQUIPMENT_KINDS) {
      expect(offered.has(kind), `no tool for ${kind}`).toBe(true);
      expect(messages.equipment![kind], `messages: equipment.${kind}`).toBeTruthy();
    }
  });

  it("every tool that places something makes a valid diagram when dropped on an empty court", () => {
    for (const tool of TOOLS.filter((t) => t.place)) {
      const empty = diagramSchema.parse({ ...base(), entities: [], annotations: [] });
      const spec = tool.place!;
      const ops = placeOps(spec, { x: 1, y: 6 }, empty, { number: "7" });
      const d = run(empty, ops);
      expect(d.entities.length, tool.id).toBe(spec.kind === "player" && spec.withBall ? 2 : 1);
    }
  });

  it("a ball dropped on a player who has none goes into their hands; on one who has a ball it lies on the floor", () => {
    const d = start();
    const free = run(
      { ...base(), entities: base().entities.filter((e) => e.id !== "b1") },
      placeOps({ kind: "ball" }, { x: -4, y: 5 }, d, { dropOn: { id: "o2", hasBall: false } }),
    );
    expect(free.entities.find((e) => e.type === "ball")).toMatchObject({ heldBy: "o2" });
    const onFloor = placeOps({ kind: "ball" }, { x: 0, y: 7 }, d, {
      dropOn: { id: "o1", hasBall: true },
    });
    expect(onFloor[0]).toMatchObject({ op: "add_ball", at: { x: 0, y: 7 } });
  });

  it("numbered players and cones take the typed number, or number themselves", () => {
    const d = start();
    const typed = placeOps({ kind: "player", side: "offense", numbered: true }, { x: 1, y: 5 }, d, {
      number: "23",
    });
    expect(typed[0]).toMatchObject({ label: "23" });
    const auto = placeOps({ kind: "cone", numbered: true }, { x: 1, y: 5 }, d);
    expect(auto[0]).toMatchObject({ label: "2" }); // one cone already on the court
  });

  it("searches names and keywords, ignoring case", () => {
    const name = (id: string) => messages.tools![id] ?? id;
    expect(searchTools("LADDER", name).map((t) => t.id)).toEqual(
      expect.arrayContaining(["ladder", "ladderShort", "ladderLong"]),
    );
    expect(searchTools("stopwatch", name).map((t) => t.id)).toContain("timer");
    expect(searchTools("double team", name).map((t) => t.id)).toContain("trap"); // a keyword
    expect(searchTools("zzzz", name)).toEqual([]);
    expect(searchTools("  ", name)).toHaveLength(TOOLS.length);
    expect(TOOL_BY_ID.get("cone")).toBeDefined();
  });

  it("successive clicks never stack objects on one spot", () => {
    let d = diagramSchema.parse({ ...base(), entities: [], annotations: [] });
    const spec = { kind: "player", side: "offense" } as const;
    for (let i = 0; i < 14; i++) {
      const scene = sceneOf(d);
      const at = defaultSpot(
        spec,
        d.entities,
        scene.entities.map((e) => e.at),
        pack.anchors,
      );
      d = run(d, placeOps(spec, at, d));
    }
    const pts = resolveDiagram(d, pack).resolved.entities.map((r) => r.at);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(0.5);
  });
});

describe("selecting", () => {
  it("shift adds and removes; a plain click replaces; a click on nothing clears", () => {
    const a = selectHit(NO_SELECTION, { kind: "entity", id: "o1" }, false);
    const b = selectHit(a, { kind: "entity", id: "o2" }, true);
    expect(b.entities).toEqual(["o1", "o2"]);
    expect(selectHit(b, { kind: "entity", id: "o1" }, true).entities).toEqual(["o2"]);
    expect(selectHit(b, { kind: "entity", id: "k1" }, false).entities).toEqual(["k1"]);
    expect(selectHit(b, null, false)).toEqual(NO_SELECTION);
    expect(selectHit(b, null, true)).toEqual(b);
  });

  it("forgets what no longer exists", () => {
    const d = start();
    const s = pruneSelection({ entities: ["o1", "gone"], actions: ["a9"], notes: [0, 4] }, d);
    expect(s).toEqual({ entities: ["o1"], actions: [], notes: [0] });
  });

  it("finds the ball before the player who holds it, a rotated ladder by its shape, and lines and notes last", () => {
    const d = run(start(), [
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -4, y: 2 }] } },
    ]);
    const scene = sceneOf(d);
    const ball = scene.entities.find((e) => e.entity.id === "b1")!.at;
    expect(hitTest(ball, scene)).toEqual({ kind: "entity", id: "b1" });
    expect(hitTest({ x: 0, y: 7 }, scene)).toEqual({ kind: "entity", id: "o1" });
    // the ladder was turned 90°: it is tall, not wide
    expect(hitTest({ x: 3, y: 10.8 }, scene)).toEqual({ kind: "entity", id: "e1" });
    expect(hitTest({ x: 5.4, y: 9 }, scene)).toBeNull();
    // the cut line, then the note
    expect(hitTest({ x: -4, y: 3.5 }, scene)).toEqual({ kind: "action", id: "a1" });
    expect(hitTest({ x: -3, y: 10 }, scene)).toEqual({ kind: "note", index: 0 });
    expect(hitTest({ x: 6, y: 11 }, scene)).toBeNull();
    // a finger reaches further than a mouse
    expect(hitTest({ x: -0.9, y: 7 }, scene, 0.1)).toBeNull();
    expect(hitTest({ x: -0.9, y: 7 }, scene, 0.45)).toEqual({ kind: "entity", id: "o1" });
  });

  it("a selection rectangle takes objects and notes inside it, but not a held ball on its own", () => {
    const scene = sceneOf(start());
    const s = marqueeSelect({ x: -6, y: 4 }, { x: 1, y: 11 }, scene);
    expect([...s.entities].sort()).toEqual(["o1", "o2"]);
    expect(s.notes).toEqual([0]);
    expect(
      marqueeSelect({ x: -6, y: 4 }, { x: 1, y: 11 }, scene, {
        entities: ["k1"],
        actions: [],
        notes: [],
      }).entities,
    ).toContain("k1");
  });
});

describe("what a drag means", () => {
  it("in step 1 a drag moves the starting position, and only the players who can walk walk in later steps", () => {
    const d = run(start(), [
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -4, y: 2 }], step: 1 } },
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2", step: 2 } },
    ]);
    const s1 = dragOps(d, sceneOf(d, 1), ["o1", "k1"], 1, 1, 1);
    expect(s1).toEqual([{ op: "move_by", ids: ["o1", "k1"], dx: 1, dy: 1 }]);

    // step 2: the player walks (a movement is drawn), the cone simply moves
    const s2 = dragOps(d, sceneOf(d, 2), ["o1", "k1"], 1, 1, 2);
    expect(s2[0]).toEqual({ op: "move_by", ids: ["k1"], dx: 1, dy: 1 });
    expect(s2[1]).toMatchObject({
      op: "add_action",
      action: { type: "move", entity: "o1", step: 2, path: [{ x: 1, y: 8 }] },
    });
    // dragging the same player again extends that movement instead of drawing a second one
    const walked = run(d as DiagramInput, s2 as DiagramOp[]);
    const again = dragOps(walked, sceneOf(walked, 2), ["o1"], 0.5, 0, 2);
    expect(again[0]).toMatchObject({ op: "set_path" });
  });

  it("does nothing for a zero drag, an empty selection, or a ball that rides with its holder", () => {
    const d = start();
    expect(dragOps(d, sceneOf(d), ["o1"], 0, 0, 1)).toEqual([]);
    expect(dragOps(d, sceneOf(d), [], 2, 2, 1)).toEqual([]);
    expect(dragOps(d, sceneOf(d), ["b1"], 2, 2, 1)).toEqual([]);
  });

  it("turns each object to its own new angle, grouping equal results, and leaves balls alone", () => {
    const d = run(start(), [{ op: "set_props", ids: ["k1"], rotation: 30 }]);
    const ops = rotateOps(sceneOf(d), ["e1", "k1", "b1"], 15);
    expect(ops).toEqual([
      { op: "set_props", ids: ["e1"], rotation: 105 },
      { op: "set_props", ids: ["k1"], rotation: 45 },
    ]);
    expect(rotateOps(sceneOf(d), ["e1"], 100)[0]).toMatchObject({ rotation: -170 }); // wraps
  });

  it("deletes objects first (their lines go with them), then lines, then notes from the highest index", () => {
    const d = run(start(), [
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2" } },
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -4, y: 2 }], step: 2 } },
      { op: "add_text", at: { x: 1, y: 1 }, text: "Two" },
    ]);
    const ops = deleteOps(d, { entities: ["o1"], actions: ["a1", "a2"], notes: [0, 1] });
    expect(ops.map((o) => o.op)).toEqual([
      "remove",
      "remove_action",
      "remove_annotation",
      "remove_annotation",
    ]);
    expect(ops[2]).toMatchObject({ index: 1 });
    const after = run(d as DiagramInput, ops);
    expect(after.actions).toEqual([]);
    expect(after.entities.find((e) => e.id === "o1")).toBeUndefined();
  });
});

describe("copy and paste", () => {
  it("copies objects where they stand, the ball a player holds, the lines between copied objects, and notes", () => {
    const d = run(start(), [
      { op: "add_action", action: { type: "pass", from: "o1", to: "o2" } },
      { op: "add_action", action: { type: "cut", entity: "o2", path: [{ x: -4, y: 2 }], step: 2 } },
    ]);
    const f = buildFragment(d, sceneOf(d), { entities: ["o1", "o2"], actions: [], notes: [0] });
    expect(f.entities.map((e) => e.id).sort()).toEqual(["b1", "o1", "o2"]);
    expect(f.actions.map((a) => a.id).sort()).toEqual(["a1", "a2"]); // both are between copied objects
    expect(f.annotations).toHaveLength(1);
    const partial = buildFragment(d, sceneOf(d), { entities: ["o2"], actions: [], notes: [] });
    expect(partial.actions.map((a) => a.id)).toEqual(["a2"]); // the pass needs o1 too, so it stays behind
    const pasted = run(d as DiagramInput, [
      {
        op: "paste",
        entities: f.entities,
        actions: f.actions,
        annotations: f.annotations,
        dx: 2,
        dy: 0,
      },
    ]);
    expect(pasted.entities).toHaveLength(d.entities.length + 3);
    expect(pasted.actions).toHaveLength(d.actions.length + 2);
    expect(pasted.annotations).toHaveLength(2);
  });
});

describe("history", () => {
  it("undo and redo walk exactly one edit at a time, and a new edit clears the redo list", () => {
    const a = start();
    const b = run(a as DiagramInput, [{ op: "add_cone", at: { x: 1, y: 2 } }]);
    const c = run(b as DiagramInput, [{ op: "add_cone", at: { x: 2, y: 2 } }]);
    let h = { past: [] as Diagram[], present: a, future: [] as Diagram[] };
    h = historyReducer(h, { type: "commit", diagram: b });
    h = historyReducer(h, { type: "commit", diagram: c });
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(b);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(a);
    expect(historyReducer(h, { type: "undo" })).toBe(h); // nothing further back
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(b);
    h = historyReducer(h, { type: "commit", diagram: c });
    expect(h.future).toEqual([]);
  });

  it("keeps a generous but bounded history", () => {
    let h = { past: [] as Diagram[], present: start(), future: [] as Diagram[] };
    for (let i = 0; i < MAX_HISTORY + 20; i++)
      h = historyReducer(h, { type: "commit", diagram: start() });
    expect(h.past).toHaveLength(MAX_HISTORY);
  });
});

describe("zoom and pan", () => {
  const box = courtBox(pack);
  it("starts on the whole court and keeps the point under the cursor still while zooming", () => {
    const v = wholeCourt(box);
    const whole = visibleBox(v, box);
    for (const k of ["x", "y", "w", "h"] as const) expect(whole[k]).toBeCloseTo(box[k], 6);
    const focus = { x: 4, y: 9 };
    const z = zoomAt(v, box, 2, focus);
    expect(z.scale).toBe(2);
    const before = (focus.x - visibleBox(v, box).x) / visibleBox(v, box).w;
    const after = (focus.x - visibleBox(z, box).x) / visibleBox(z, box).w;
    expect(after).toBeCloseTo(before, 5);
  });
  it("limits the zoom and never shows anything off the court", () => {
    expect(zoomAt(wholeCourt(box), box, 0.1, { x: 0, y: 5 }).scale).toBe(1);
    expect(zoomAt(wholeCourt(box), box, 1000, { x: 0, y: 5 }).scale).toBe(6);
    const c = clampView({ scale: 3, cx: -100, cy: 100 }, box);
    const v = visibleBox(c, box);
    expect(v.x).toBeGreaterThanOrEqual(box.x - 1e-9);
    expect(v.y + v.h).toBeLessThanOrEqual(box.y + box.h + 1e-9);
    expect(panBy({ scale: 2, cx: 0, cy: 5 }, box, 1, 1)).toMatchObject({ scale: 2, cx: 1, cy: 6 });
  });
  it("fits the drawing (never further out than the whole court) and describes the view as a viewBox", () => {
    const empty = sceneOf(diagramSchema.parse({ ...base(), entities: [], annotations: [] }));
    expect(fitToContent(empty, box)).toEqual(wholeCourt(box));
    const tight = fitToContent(sceneOf(start()), box);
    expect(tight.scale).toBeGreaterThanOrEqual(1);
    expect(viewBoxString(wholeCourt(box), box).split(" ")).toHaveLength(4);
  });
});
