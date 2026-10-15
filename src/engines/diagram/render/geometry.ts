import type { Pt } from "../pack";

/** Deterministic number formatting (3 decimals) so rendered SVG is stable for golden tests / PDF export. */
export const n = (v: number): number => Math.round(v * 1000) / 1000;

export const pointsAttr = (ps: readonly Pt[]): string =>
  ps.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Shorten a polyline at both ends so lines start/stop at the edge of shapes instead of their centres. */
export function trim(points: readonly Pt[], startCut: number, endCut: number): Pt[] {
  const out = points.map((p) => ({ ...p }));
  if (out.length < 2) return out;
  const a = out[0]!;
  const b = out[1]!;
  const l0 = dist(a, b);
  if (l0 > 0) {
    const c = Math.min(startCut, l0 * 0.45);
    out[0] = { x: a.x + ((b.x - a.x) / l0) * c, y: a.y + ((b.y - a.y) / l0) * c };
  }
  const last = out.length - 1;
  const p = out[last]!;
  const q = out[last - 1]!;
  const l1 = dist(q, p);
  if (l1 > 0) {
    const c = Math.min(endCut, l1 * 0.45);
    out[last] = { x: p.x - ((p.x - q.x) / l1) * c, y: p.y - ((p.y - q.y) / l1) * c };
  }
  return out;
}

/** Unit direction of the final segment. */
export function endDirection(points: readonly Pt[]): Pt {
  const p = points[points.length - 1]!;
  const q = points[points.length - 2] ?? { x: p.x, y: p.y - 1 };
  const l = dist(q, p) || 1;
  return { x: (p.x - q.x) / l, y: (p.y - q.y) / l };
}

/** Triangle arrowhead polygon at `tip`, pointing along `dir`. */
export function arrowHead(tip: Pt, dir: Pt, length = 0.52, half = 0.28): string {
  const base = { x: tip.x - dir.x * length, y: tip.y - dir.y * length };
  const perp = { x: -dir.y, y: dir.x };
  return pointsAttr([
    tip,
    { x: base.x + perp.x * half, y: base.y + perp.y * half },
    { x: base.x - perp.x * half, y: base.y - perp.y * half },
  ]);
}

/** The T-bar that ends a screen line: a short segment perpendicular to `dir` through `at`. */
export function tBar(at: Pt, dir: Pt, halfLength = 0.5): [Pt, Pt] {
  const perp = { x: -dir.y, y: dir.x };
  return [
    { x: at.x + perp.x * halfLength, y: at.y + perp.y * halfLength },
    { x: at.x - perp.x * halfLength, y: at.y - perp.y * halfLength },
  ];
}

/** Sinusoidal offset along a polyline — the conventional "wavy line" for a dribble. Starts and ends on the path. */
export function wavy(
  points: readonly Pt[],
  amplitude = 0.17,
  wavelength = 0.7,
  sample = 0.1,
): Pt[] {
  if (points.length < 2) return [...points];
  const segs: Array<{ a: Pt; b: Pt; len: number }> = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = dist(a, b);
    segs.push({ a, b, len });
    total += len;
  }
  if (total === 0) return [...points];
  const out: Pt[] = [];
  let walked = 0;
  for (const { a, b, len } of segs) {
    if (len === 0) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const perp = { x: -dir.y, y: dir.x };
    for (let s = 0; s < len; s += sample) {
      const at = walked + s;
      const envelope = Math.min(1, at / 0.35, (total - at) / 0.35);
      const off = amplitude * envelope * Math.sin((2 * Math.PI * at) / wavelength);
      out.push({ x: a.x + dir.x * s + perp.x * off, y: a.y + dir.y * s + perp.y * off });
    }
    walked += len;
  }
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * Bend a polyline: each segment becomes a quadratic curve whose middle is pushed sideways by `curve` (−1…1) times half the
 * segment's length (positive = to the right of the direction of travel). Returned as a dense polyline, so every line style
 * (dashes, waves, arrowheads) keeps working on a curved path. `curve` 0 returns the points untouched.
 */
export function sampleCurve(points: readonly Pt[], curve: number, perSegment = 14): Pt[] {
  if (!curve || points.length < 2) return [...points];
  const out: Pt[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = dist(a, b);
    if (len === 0) {
      out.push(b);
      continue;
    }
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const push = curve * len * 0.5;
    const c = { x: (a.x + b.x) / 2 - nx * push, y: (a.y + b.y) / 2 - ny * push };
    for (let s = 1; s <= perSegment; s++) {
      const t = s / perSegment;
      const u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      });
    }
  }
  return out;
}

/** Point a fraction `t` (0…1) of the way along a polyline, measured by length. */
export function pointAlong(points: readonly Pt[], t: number): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const l = dist(a, b);
    if (want <= l || i === points.length - 1) {
      const k = l === 0 ? 0 : Math.min(1, want / l);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    want -= l;
  }
  return points[points.length - 1]!;
}
