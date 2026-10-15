import type { CourtPack, Pt } from "./pack";

/**
 * Smart snapping for the editor: a dragged object is pulled to the nearest thing worth lining up with — a named spot on the
 * court, a court boundary line, another object's row or column, or the grid — so a diagram looks neat without pixel-perfect
 * dragging. Pure: the same inputs always snap the same way, and `guides` says what it snapped to so the editor can show it.
 */
export interface SnapOptions {
  /** Grid size in metres, or false for no grid. */
  grid: number | false;
  /** Pull to named court spots and the court's boundary lines. */
  courtLines: boolean;
  /** Line up with other objects' rows and columns. */
  objects: boolean;
  /** How close (metres) something must be to pull. The editor passes a distance that is a constant number of screen pixels. */
  radius: number;
}

export type SnapGuide =
  | { kind: "spot"; at: Pt; name: string }
  | { kind: "line"; axis: "x" | "y"; value: number }
  | { kind: "object"; axis: "x" | "y"; value: number }
  | { kind: "grid"; at: Pt };

export interface SnapResult {
  point: Pt;
  guides: SnapGuide[];
}

export const DEFAULT_GRID = 0.5;

export function snapPoint(
  p: Pt,
  pack: Pick<CourtPack, "bounds" | "anchors">,
  others: readonly Pt[],
  opts: SnapOptions,
): SnapResult {
  const { minX, maxX, minY, maxY } = pack.bounds;
  const clamp = (q: Pt): Pt => ({
    x: Math.min(maxX, Math.max(minX, q.x)),
    y: Math.min(maxY, Math.max(minY, q.y)),
  });
  const guides: SnapGuide[] = [];
  let x = p.x;
  let y = p.y;

  if (opts.courtLines) {
    // a named spot wins outright: it fixes both axes
    let best: { name: string; at: Pt; d: number } | undefined;
    for (const [name, at] of Object.entries(pack.anchors)) {
      const d = Math.hypot(at.x - p.x, at.y - p.y);
      if (d <= opts.radius && (!best || d < best.d)) best = { name, at, d };
    }
    if (best)
      return { point: clamp(best.at), guides: [{ kind: "spot", at: best.at, name: best.name }] };
  }

  let snappedX = false;
  let snappedY = false;

  if (opts.courtLines) {
    for (const value of [minX, maxX, 0]) {
      if (Math.abs(value - x) <= opts.radius) {
        x = value;
        snappedX = true;
        guides.push({ kind: "line", axis: "x", value });
        break;
      }
    }
    for (const value of [minY, maxY]) {
      if (Math.abs(value - y) <= opts.radius) {
        y = value;
        snappedY = true;
        guides.push({ kind: "line", axis: "y", value });
        break;
      }
    }
  }

  if (opts.objects) {
    let bx: { v: number; d: number } | undefined;
    let by: { v: number; d: number } | undefined;
    for (const o of others) {
      const dx = Math.abs(o.x - p.x);
      const dy = Math.abs(o.y - p.y);
      if (!snappedX && dx <= opts.radius && (!bx || dx < bx.d)) bx = { v: o.x, d: dx };
      if (!snappedY && dy <= opts.radius && (!by || dy < by.d)) by = { v: o.y, d: dy };
    }
    if (bx) {
      x = bx.v;
      snappedX = true;
      guides.push({ kind: "object", axis: "x", value: bx.v });
    }
    if (by) {
      y = by.v;
      snappedY = true;
      guides.push({ kind: "object", axis: "y", value: by.v });
    }
  }

  if (opts.grid) {
    const g = opts.grid;
    if (!snappedX) x = Math.round(x / g) * g;
    if (!snappedY) y = Math.round(y / g) * g;
    if (!snappedX && !snappedY) guides.push({ kind: "grid", at: { x, y } });
  }

  const out = clamp({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  return { point: out, guides };
}
