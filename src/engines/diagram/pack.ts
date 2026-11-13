import type { ActionType } from "./schema";

/**
 * A CourtPack is everything the engine needs to know about ONE playing surface. Sports provide
 * them (src/sports/<sport>/…); the engine never imports a sport (ARCHITECTURE.md §10.4).
 * All lengths are metres; +x is screen-right, +y is screen-down (away from the primary basket/goal).
 */
export type Pt = { x: number; y: number };

export type Stroke = "line" | "dashed" | "faint";

export type CourtPrimitive = {
  /** SVG path data in metres. */
  d: string;
  stroke: Stroke;
  /** Optional SVG transform, e.g. to mirror the far end of a full court. */
  transform?: string;
  /**
   * `"accent"` paints the shape with the sport's accent colour at low opacity — a real court's painted key/lane — but
   * ONLY on screen: print and mono exports stay unfilled, so a PDF/PNG never spends ink on a colour fill (§7).
   */
  fill?: "none" | "surface" | "accent";
};

export interface CourtPack {
  /** Stable id, e.g. "basketball.fiba.half". */
  id: string;
  label: string;
  /** Playable area in metres. Positions outside (plus `tolerance`) fail validation. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Extra drawing space around the bounds. */
  margin: number;
  tolerance: number;
  /** Named positions ("top_key") — the vocabulary humans and LLMs use instead of coordinates. */
  anchors: Readonly<Record<string, Pt>>;
  /** Default target of a `shot` action (the basket / goal). */
  primaryTarget: Pt;
  /**
   * Baskets standing on this surface, for views that draw in 3D: the rim centre and which way the backboard lies
   * from it along y (-1 = toward smaller y). Optional — a surface without it is drawn flat.
   */
  hoops?: readonly { at: Pt; board: 1 | -1 }[];
  /** Court markings, drawn back to front. */
  primitives: readonly CourtPrimitive[];
  /** Actions this sport's vocabulary allows on this surface. */
  actions: readonly ActionType[];
  /**
   * Where the numbers come from and how far they can be trusted. `crossChecked` = compared against a
   * SECONDARY source only (never call that "verified"); `unverified` = not checked at all. Verification
   * against the governing body's own text is a separate step that has to be recorded explicitly.
   */
  source: { name: string; crossChecked: readonly string[]; unverified: readonly string[] };
}

export const anchorLabel = (name: string) => name.replaceAll("_", " ");
