import {
  EQUIPMENT,
  isCarrier,
  PLAYER_RADIUS,
  resolveDiagram,
  type CourtPack,
  type Diagram,
  type DiagramOp,
  type Entity,
  type Pt,
  type Resolved,
} from "@/engines/diagram";

/**
 * The workspace's logic without the screen: what is where, what a click hit, what a selection holds, what a drag means as
 * diagram operations, how the view zooms. Framework-free, so every rule that decides "what happens when the coach does X"
 * is a plain function with a test — the component only turns pointer events into calls to these.
 */

// ---------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------

export interface Selection {
  entities: readonly string[];
  actions: readonly string[];
  /** Annotation indexes. */
  notes: readonly number[];
}

export const NO_SELECTION: Selection = { entities: [], actions: [], notes: [] };

export const selectionSize = (s: Selection) =>
  s.entities.length + s.actions.length + s.notes.length;
export const isNothing = (s: Selection) => selectionSize(s) === 0;

const toggled = <T>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** Click without Shift replaces the selection; with Shift it adds or removes the one thing. */
export function selectHit(current: Selection, hit: Hit | null, additive: boolean): Selection {
  if (!hit) return additive ? current : NO_SELECTION;
  const only: Selection =
    hit.kind === "entity"
      ? { entities: [hit.id], actions: [], notes: [] }
      : hit.kind === "action"
        ? { entities: [], actions: [hit.id], notes: [] }
        : { entities: [], actions: [], notes: [hit.index] };
  if (!additive) return only;
  return {
    entities: hit.kind === "entity" ? toggled(current.entities, hit.id) : current.entities,
    actions: hit.kind === "action" ? toggled(current.actions, hit.id) : current.actions,
    notes: hit.kind === "note" ? toggled(current.notes, hit.index) : current.notes,
  };
}

/** Keep only what still exists (after a delete, an undo, a step change). */
export function pruneSelection(
  s: Selection,
  d: Pick<Diagram, "entities" | "actions" | "annotations">,
): Selection {
  const ids = new Set(d.entities.map((e) => e.id));
  const actions = new Set(d.actions.map((a) => a.id));
  return {
    entities: s.entities.filter((id) => ids.has(id)),
    actions: s.actions.filter((id) => actions.has(id)),
    notes: s.notes.filter((i) => i < d.annotations.length),
  };
}

// ---------------------------------------------------------------------------------------------
// The scene: what is where in the step being shown
// ---------------------------------------------------------------------------------------------

export interface SceneEntity {
  entity: Entity;
  at: Pt;
  /** Half the width and height of what can be grabbed, in metres, before rotation. */
  halfW: number;
  halfH: number;
  /** Degrees. */
  rotation: number;
  /** Grab order: smaller wins where things overlap (a ball over the player who holds it). */
  priority: number;
}

export interface SceneAction {
  id: string;
  step: number;
  /** The path as drawn. */
  points: Pt[];
}

export interface Scene {
  entities: SceneEntity[];
  actions: SceneAction[];
  notes: Array<{ index: number; box: { minX: number; minY: number; maxX: number; maxY: number } }>;
  resolved: Resolved;
}

const PRIORITY: Record<Entity["type"], number> = {
  ball: 0,
  player: 1,
  coach: 1,
  marker: 2,
  cone: 2,
  equipment: 3,
};

/** Everything the coach can grab in `step` (the step being shown), with its size, position and turn. */
export function buildScene(d: Diagram, pack: CourtPack, step: number): Scene {
  const { resolved } = resolveDiagram(d, pack);
  const starts = resolved.stepStarts.get(step);
  const holders = new Map<string, string>();
  // possession at the start of the step: the ball sits beside whoever holds it then
  for (const e of d.entities) if (e.type === "ball" && e.heldBy) holders.set(e.id, e.heldBy);
  const at = (id: string, fallback: Pt) => starts?.get(id) ?? fallback;

  const entities: SceneEntity[] = resolved.entities.map(({ entity, at: base }) => {
    const scale = "scale" in entity && entity.scale ? entity.scale : 1;
    const rotation = "rotation" in entity && entity.rotation ? entity.rotation : 0;
    let where = entity.type === "ball" ? base : at(entity.id, base);
    if (entity.type === "ball" && entity.heldBy) {
      const holder = at(entity.heldBy, base);
      where = { x: holder.x + 0.46, y: holder.y - 0.4 };
    }
    let halfW = 0.4;
    let halfH = 0.4;
    switch (entity.type) {
      case "player":
      case "coach":
        halfW = halfH = (PLAYER_RADIUS + 0.12) * scale;
        break;
      case "ball":
        halfW = halfH = 0.3 * scale;
        break;
      case "cone":
        halfW = halfH = 0.4 * scale;
        break;
      case "marker":
        halfW = halfH = 0.5 * scale;
        break;
      case "equipment": {
        const s = EQUIPMENT[entity.kind];
        halfW = Math.max(0.3, (s.w / 2) * scale + 0.12);
        halfH = Math.max(0.3, (s.h / 2) * scale + 0.12);
        break;
      }
    }
    return { entity, at: where, halfW, halfH, rotation, priority: PRIORITY[entity.type] };
  });

  const actions: SceneAction[] = resolved.actions
    .filter((ra) => ra.step === step)
    .map((ra) => ({ id: ra.action.id, step: ra.step, points: ra.points }));

  const notes = resolved.annotations.map((ra, index) => {
    const a = ra.annotation;
    const pts =
      ra.points ??
      (a.type === "zone_rect" && ra.b
        ? [ra.a, ra.b]
        : a.type === "zone_circle"
          ? [
              { x: ra.a.x - a.radius, y: ra.a.y - a.radius },
              { x: ra.a.x + a.radius, y: ra.a.y + a.radius },
            ]
          : a.type === "text"
            ? [
                { x: ra.a.x - Math.max(0.6, a.text.length * 0.16), y: ra.a.y - 0.4 },
                { x: ra.a.x + Math.max(0.6, a.text.length * 0.16), y: ra.a.y + 0.4 },
              ]
            : [
                { x: ra.a.x - 0.5, y: ra.a.y - 0.5 },
                { x: ra.a.x + 0.5, y: ra.a.y + 0.5 },
              ]);
    return {
      index,
      box: {
        minX: Math.min(...pts.map((p) => p.x)),
        minY: Math.min(...pts.map((p) => p.y)),
        maxX: Math.max(...pts.map((p) => p.x)),
        maxY: Math.max(...pts.map((p) => p.y)),
      },
    };
  });

  return { entities, actions, notes, resolved };
}

// ---------------------------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------------------------

export type Hit =
  { kind: "entity"; id: string } | { kind: "action"; id: string } | { kind: "note"; index: number };

/** Distance from a point to a segment. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const distToPolyline = (p: Pt, pts: readonly Pt[]): number => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++)
    best = Math.min(best, distToSegment(p, pts[i - 1]!, pts[i]!));
  return pts.length === 1 ? Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) : best;
};

/** Is `p` inside this entity's grab area (a rectangle turned by its rotation)? `slop` widens it for fingers. */
export function insideEntity(p: Pt, e: SceneEntity, slop = 0): boolean {
  const rad = (-e.rotation * Math.PI) / 180;
  const dx = p.x - e.at.x;
  const dy = p.y - e.at.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  if (e.entity.type === "player" || e.entity.type === "coach" || e.entity.type === "ball")
    return Math.hypot(dx, dy) <= e.halfW + slop; // round things are round whatever their rotation
  return Math.abs(lx) <= e.halfW + slop && Math.abs(ly) <= e.halfH + slop;
}

/**
 * What is under a point. Objects win over lines, lines over notes; among objects the smallest priority number wins (a ball
 * over its holder), then the nearest centre. `slop` (metres) is the extra reach: bigger for a finger than for a mouse.
 */
export function hitTest(p: Pt, scene: Scene, slop = 0.1): Hit | null {
  const under = scene.entities
    .filter((e) => insideEntity(p, e, slop))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        Math.hypot(a.at.x - p.x, a.at.y - p.y) - Math.hypot(b.at.x - p.x, b.at.y - p.y),
    );
  if (under[0]) return { kind: "entity", id: under[0].entity.id };

  let nearest: { id: string; d: number } | null = null;
  for (const a of scene.actions) {
    const d = distToPolyline(p, a.points);
    if (d <= 0.4 + slop && (!nearest || d < nearest.d)) nearest = { id: a.id, d };
  }
  if (nearest) return { kind: "action", id: nearest.id };

  for (const n of [...scene.notes].reverse()) {
    const b = n.box;
    if (
      p.x >= b.minX - slop &&
      p.x <= b.maxX + slop &&
      p.y >= b.minY - slop &&
      p.y <= b.maxY + slop
    )
      return { kind: "note", index: n.index };
  }
  return null;
}

/** Objects and notes whose centre lies inside the rectangle (the selection rectangle). */
export function marqueeSelect(
  a: Pt,
  b: Pt,
  scene: Scene,
  additiveTo: Selection = NO_SELECTION,
): Selection {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const inside = (p: Pt) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  const entities = scene.entities
    // a held ball is picked up by its holder, not on its own
    .filter((e) => inside(e.at) && !(e.entity.type === "ball" && e.entity.heldBy))
    .map((e) => e.entity.id);
  const notes = scene.notes
    .filter((n) => inside({ x: (n.box.minX + n.box.maxX) / 2, y: (n.box.minY + n.box.maxY) / 2 }))
    .map((n) => n.index);
  const merge = <T>(x: readonly T[], y: readonly T[]) => [...new Set([...x, ...y])];
  return {
    entities: merge(additiveTo.entities, entities),
    actions: additiveTo.actions,
    notes: merge(additiveTo.notes, notes),
  };
}

// ---------------------------------------------------------------------------------------------
// Turning gestures into operations
// ---------------------------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Dragging objects by (dx, dy). In step 1 (or for things that cannot walk — cones, equipment) the objects simply move, which
 * changes where they START. In a later step a player or coach that is dragged WALKS there: the drag draws (or extends) a
 * movement in that step, so the drill keeps its history instead of silently rewriting the earlier steps.
 */
export function dragOps(
  d: Diagram,
  scene: Scene,
  ids: readonly string[],
  dx: number,
  dy: number,
  step: number,
): DiagramOp[] {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return [];
  const byId = new Map(scene.entities.map((e) => [e.entity.id, e] as const));
  const walking: string[] = [];
  const staying: string[] = [];
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) continue;
    if (e.entity.type === "ball" && e.entity.heldBy) continue; // rides with its holder
    (step > 1 && isCarrier(e.entity) ? walking : staying).push(id);
  }
  const ops: DiagramOp[] = [];
  if (staying.length) ops.push({ op: "move_by", ids: staying, dx: round2(dx), dy: round2(dy) });
  for (const id of walking) {
    const from = byId.get(id)!.at;
    const to = { x: round2(from.x + dx), y: round2(from.y + dy) };
    const existing = d.actions.find((a) => a.step === step && a.type === "move" && a.entity === id);
    if (existing && existing.type === "move") {
      ops.push({ op: "set_path", id: existing.id, path: [...existing.path.slice(0, -1), to] });
    } else {
      ops.push({ op: "add_action", action: { type: "move", entity: id, path: [to], step } });
    }
  }
  return ops;
}

/** Turn a set of objects: one `set_props` per distinct resulting angle (they may start from different angles). */
export function rotateOps(scene: Scene, ids: readonly string[], by: number): DiagramOp[] {
  const groups = new Map<number, string[]>();
  for (const id of ids) {
    const e = scene.entities.find((x) => x.entity.id === id);
    if (!e || e.entity.type === "ball") continue;
    let next = e.rotation + by;
    next = ((((next + 180) % 360) + 360) % 360) - 180;
    groups.set(next, [...(groups.get(next) ?? []), id]);
  }
  return [...groups].map(([rotation, list]) => ({ op: "set_props", ids: list, rotation }));
}

/** Delete everything selected. Entities first (removing one takes its actions with it), then leftover actions and notes, highest note index first. */
export function deleteOps(d: Diagram, s: Selection): DiagramOp[] {
  const ops: DiagramOp[] = s.entities.map((id) => ({ op: "remove", id }));
  const gone = new Set(s.entities);
  const involved = (id: string) => {
    const a = d.actions.find((x) => x.id === id);
    if (!a) return false;
    return a.type === "pass" ? gone.has(a.from) || gone.has(a.to) : gone.has(a.entity);
  };
  for (const id of s.actions) if (!involved(id)) ops.push({ op: "remove_action", id });
  for (const index of [...s.notes].sort((x, y) => y - x))
    ops.push({ op: "remove_annotation", index });
  return ops;
}

// ---------------------------------------------------------------------------------------------
// Copy and paste
// ---------------------------------------------------------------------------------------------

export interface Fragment {
  entities: Entity[];
  actions: Diagram["actions"];
  annotations: Diagram["annotations"];
}

/**
 * What Copy takes: the selected objects (each written at the spot where it stands in this step, so a paste lands in the
 * same place whatever the objects were positioned relative to), the ball a copied player holds, the lines that join two
 * copied objects, and the selected notes.
 */
export function buildFragment(d: Diagram, scene: Scene, s: Selection): Fragment {
  const chosen = new Set(s.entities);
  // a ball goes with its holder
  for (const e of d.entities)
    if (e.type === "ball" && e.heldBy && chosen.has(e.heldBy)) chosen.add(e.id);
  const at = new Map(scene.entities.map((e) => [e.entity.id, e.at] as const));
  const entities = d.entities
    .filter((e) => chosen.has(e.id))
    .map((e) => {
      if (e.type === "ball" && e.heldBy) return e; // stays with its (copied) holder
      const where = at.get(e.id);
      return where ? ({ ...e, at: { x: round2(where.x), y: round2(where.y) } } as Entity) : e;
    });
  const actions = d.actions.filter((a) => {
    const involved = a.type === "pass" ? [a.from, a.to] : [a.entity];
    return involved.every((id) => chosen.has(id));
  });
  const annotations = s.notes.flatMap((i) => (d.annotations[i] ? [d.annotations[i]!] : []));
  return { entities, actions, annotations };
}

export const fragmentSize = (f: Fragment) => f.entities.length + f.annotations.length;

// ---------------------------------------------------------------------------------------------
// The view: zoom and pan
// ---------------------------------------------------------------------------------------------

export interface View {
  /** 1 = the whole court fits; 4 = a quarter of it fills the screen. */
  scale: number;
  /** The centre of what is shown, in court metres. */
  cx: number;
  cy: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

/** The whole drawable area of a court: its bounds plus the margin. */
export const courtBox = (pack: CourtPack): Box => {
  const { minX, maxX, minY, maxY } = pack.bounds;
  const m = pack.margin;
  return { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
};

export const wholeCourt = (box: Box): View => ({
  scale: 1,
  cx: box.x + box.w / 2,
  cy: box.y + box.h / 2,
});

/** The part of the court on screen for a view. */
export function visibleBox(view: View, box: Box): Box {
  const w = box.w / view.scale;
  const h = box.h / view.scale;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

/** Keep the visible part inside the court, and the zoom within its limits. */
export function clampView(view: View, box: Box): View {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale));
  const w = box.w / scale;
  const h = box.h / scale;
  return {
    scale,
    cx: Math.max(box.x + w / 2, Math.min(box.x + box.w - w / 2, view.cx)),
    cy: Math.max(box.y + h / 2, Math.min(box.y + box.h - h / 2, view.cy)),
  };
}

/** Zoom by `factor` keeping the court point under `focus` where it is on screen. */
export function zoomAt(view: View, box: Box, factor: number, focus: Pt): View {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  const real = scale / view.scale;
  // the focus point keeps its relative position inside the visible box
  return clampView(
    {
      scale,
      cx: focus.x - (focus.x - view.cx) / real,
      cy: focus.y - (focus.y - view.cy) / real,
    },
    box,
  );
}

/** Slide the view by (dx, dy) court metres. */
export const panBy = (view: View, box: Box, dx: number, dy: number): View =>
  clampView({ ...view, cx: view.cx + dx, cy: view.cy + dy }, box);

/** Zoom to show everything on the court with some room around it (never further out than the whole court). */
export function fitToContent(scene: Scene, box: Box, padding = 2): View {
  const points = [...scene.entities.map((e) => e.at), ...scene.actions.flatMap((a) => a.points)];
  if (points.length === 0) return wholeCourt(box);
  const minX = Math.min(...points.map((p) => p.x)) - padding;
  const maxX = Math.max(...points.map((p) => p.x)) + padding;
  const minY = Math.min(...points.map((p) => p.y)) - padding;
  const maxY = Math.max(...points.map((p) => p.y)) + padding;
  const scale = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  return clampView({ scale, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }, box);
}

export const viewBoxString = (view: View, box: Box): string => {
  const v = visibleBox(view, box);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `${r(v.x)} ${r(v.y)} ${r(v.w)} ${r(v.h)}`;
};
