import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiagramView, describeDiagram, diagramSchema, validateDiagram } from "@/engines/diagram";
import { getCourtPack, getSportModule, isSportKey, SPORT_MODULES } from "../registry";
import { FIBA_DIMENSIONS, FIBA_FULL_COURT, FIBA_HALF_COURT } from "./court-fiba";

describe("sport registry", () => {
  it("knows basketball, rejects everything else (the [sport] URL segment is validated against this)", () => {
    expect(isSportKey("basketball")).toBe(true);
    expect(isSportKey("football")).toBe(false); // planned in the database, but no code module yet
    expect(isSportKey("__proto__")).toBe(false);
    expect(getSportModule("basketball")?.key).toBe("basketball");
    expect(getSportModule("football")).toBeUndefined();
    expect(Object.keys(SPORT_MODULES)).toEqual(["basketball"]);
  });

  it("resolves court packs from a diagram's court reference", () => {
    expect(getCourtPack("basketball", { type: "half", variant: "fiba" })).toBe(FIBA_HALF_COURT);
    expect(getCourtPack("basketball", { type: "full", variant: "fiba" })).toBe(FIBA_FULL_COURT);
    expect(getCourtPack("basketball", { type: "half", variant: "nba" })).toBeUndefined();
    expect(getCourtPack("football", { type: "half", variant: "fiba" })).toBeUndefined();
  });
});

describe("FIBA court geometry", () => {
  it("matches the verified dimensions", () => {
    expect(FIBA_DIMENSIONS).toMatchObject({
      courtLength: 28,
      courtWidth: 15,
      arcRadius: 6.75,
      laneWidth: 4.9,
      restrictedArcRadius: 1.25,
      centreCircleRadius: 1.8,
    });
    expect(FIBA_DIMENSIONS.cornerLineFromCentre).toBe(6.6); // 0.90 m from the 7.5 m sideline
    expect(FIBA_DIMENSIONS.freeThrowLineFromBaseline).toBeCloseTo(5.8, 6);
  });

  it("half court is 15 m wide and 14 m deep; full court is 28 m long", () => {
    const h = FIBA_HALF_COURT.bounds;
    expect(h.maxX - h.minX).toBeCloseTo(15, 6);
    expect(h.maxY - h.minY).toBeCloseTo(14, 6);
    const f = FIBA_FULL_COURT.bounds;
    expect(f.maxY - f.minY).toBeCloseTo(28, 6);
  });

  it("the three-point arc meets the corner lines on the circle (no gap or kink)", () => {
    const d = FIBA_HALF_COURT.primitives.find((p) => p.d.includes("A 6.75 6.75"))?.d ?? "";
    const y = Number(/V (-?[\d.]+) A/.exec(d)?.[1]);
    expect(Math.hypot(6.6, y)).toBeCloseTo(6.75, 3);
  });

  it("cites its source and is explicit about what was not independently verified", () => {
    for (const pack of [FIBA_HALF_COURT, FIBA_FULL_COURT]) {
      expect(pack.source.name).toMatch(/FIBA/);
      expect(pack.source.verified.length).toBeGreaterThan(3);
      expect(pack.source.unverified.length).toBeGreaterThan(0);
    }
  });

  it("every named anchor lies on the court", () => {
    for (const pack of [FIBA_HALF_COURT, FIBA_FULL_COURT]) {
      const { minX, maxX, minY, maxY } = pack.bounds;
      for (const [name, p] of Object.entries(pack.anchors)) {
        expect(p.x, `${pack.id}:${name}.x`).toBeGreaterThanOrEqual(minX);
        expect(p.x, `${pack.id}:${name}.x`).toBeLessThanOrEqual(maxX);
        expect(p.y, `${pack.id}:${name}.y`).toBeGreaterThanOrEqual(minY);
        expect(p.y, `${pack.id}:${name}.y`).toBeLessThanOrEqual(maxY);
      }
    }
  });

  it("anchors are mirror-consistent: left is screen-left; the far end mirrors the near end", () => {
    const a = FIBA_HALF_COURT.anchors;
    expect(a.left_wing!.x).toBeLessThan(0);
    expect(a.right_wing!.x).toBeGreaterThan(0);
    expect(a.top_key!.y).toBeGreaterThan(a.free_throw_line!.y); // top of the key is above the free-throw line
    const full = FIBA_FULL_COURT.anchors;
    expect(full.far_top_key!.y).toBeCloseTo(24.85 - a.top_key!.y, 3);
    expect(full.far_basket!.y).toBeCloseTo(24.85, 3);
    expect(full.center_circle!.y).toBeCloseTo(12.425, 3);
  });

  it("far-end anchors are rotated 180°: 'left' is left from the ATTACKING team's point of view", () => {
    const full = FIBA_FULL_COURT.anchors;
    expect(full.left_wing!.x).toBeLessThan(0); // near end: attacking toward -y, left is screen-left
    expect(full.far_left_wing!.x).toBeGreaterThan(0); // far end: attacking toward +y, left is screen-right
    expect(full.far_right_corner!.x).toBeLessThan(0);
    expect(full.far_left_wing!.x).toBeCloseTo(-full.left_wing!.x, 3);
  });

  it("the half court has no far-end anchors", () => {
    expect(Object.keys(FIBA_HALF_COURT.anchors).some((k) => k.startsWith("far_"))).toBe(false);
  });
});

describe("basketball diagrams end to end", () => {
  const drill = diagramSchema.parse({
    schemaVersion: 1,
    sport: "basketball",
    court: { type: "half", variant: "fiba" },
    entities: [
      { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "top_key" } },
      { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "left_wing" } },
      { id: "o3", type: "player", side: "offense", label: "3", at: { anchor: "right_corner" } },
      {
        id: "x1",
        type: "player",
        side: "defense",
        label: "X1",
        at: { anchor: "top_key", offset: [0, -1.2] },
      },
      { id: "ball", type: "ball", heldBy: "o1" },
      { id: "cone", type: "cone", at: { anchor: "left_block" } },
    ],
    actions: [
      { id: "a1", step: 1, type: "pass", from: "o1", to: "o2" },
      {
        id: "a2",
        step: 1,
        type: "cut",
        entity: "o1",
        path: [{ anchor: "right_elbow" }, { anchor: "left_block" }],
      },
      { id: "a3", step: 2, type: "screen", entity: "o3", target: { entity: "x1" } },
      { id: "a4", step: 3, type: "shot", entity: "o2" },
    ],
    annotations: [
      {
        type: "zone_rect",
        from: { anchor: "left_block" },
        to: { anchor: "right_block" },
        label: "Paint",
      },
    ],
  });

  it("validates against the real court pack", () => {
    expect(validateDiagram(drill, FIBA_HALF_COURT)).toEqual([]);
  });

  it("rejects anchors that only exist on the full court when drawn on the half court", () => {
    const bad = {
      ...drill,
      entities: [{ id: "o9", type: "player", side: "offense", at: { anchor: "far_top_key" } }],
      actions: [],
      annotations: [],
    };
    const issues = validateDiagram(diagramSchema.parse(bad), FIBA_HALF_COURT);
    expect(issues.map((i) => i.code)).toContain("unknown_anchor");
    expect(validateDiagram(diagramSchema.parse(bad), FIBA_FULL_COURT)).toEqual([]);
  });

  it("renders the court, all shapes and step badges; output is clean", () => {
    const html = renderToStaticMarkup(<DiagramView diagram={drill} pack={FIBA_HALF_COURT} />);
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    expect(html).toContain("A 6.75 6.75"); // three-point arc drawn
    expect(html).toContain("Step 1: player 1 passes to player 2");
    // 3 offence circles + 1 ball + 4 numbered step badges (defenders are squares, the cone a triangle)
    expect((html.match(/<circle/g) ?? []).length).toBe(8);
  });

  it("describes drawings for screen readers in coaching language", () => {
    const text = describeDiagram(drill);
    expect(text).toMatch(/^Half court\./);
    expect(text).toContain("3 offensive players, 1 defender, 1 ball, 1 cone");
    expect(text).toContain("cuts to the left block");
    expect(text).toContain("sets a screen on defender X1");
  });

  it("supports the full court with both baskets", () => {
    const full = diagramSchema.parse({
      schemaVersion: 1,
      sport: "basketball",
      court: { type: "full", variant: "fiba" },
      entities: [
        { id: "o1", type: "player", side: "offense", label: "1", at: { anchor: "left_corner" } },
        { id: "o2", type: "player", side: "offense", label: "2", at: { anchor: "center_circle" } },
        { id: "b", type: "ball", heldBy: "o2" },
      ],
      actions: [
        { id: "a1", step: 1, type: "dribble", entity: "o2", path: [{ anchor: "far_top_key" }] },
        { id: "a2", step: 2, type: "shot", entity: "o2", to: { anchor: "far_basket" } },
      ],
    });
    expect(validateDiagram(full, FIBA_FULL_COURT)).toEqual([]);
    const html = renderToStaticMarkup(<DiagramView diagram={full} pack={FIBA_FULL_COURT} />);
    expect(html).toContain("translate(0 24.85) scale(1 -1)"); // far end drawn by mirroring
  });
});
