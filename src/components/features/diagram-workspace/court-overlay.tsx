import type { Pt, SnapGuide } from "@/engines/diagram";
import type { Scene, Selection } from "./workspace-model";

/**
 * Everything the editor draws ON TOP of the court: what is selected, the handles to turn and resize it, the line being drawn,
 * the selection rectangle, snap guides, the place a dragged object will land. Court metres in, SVG out — no state, no text.
 * Sizes that must look constant on screen (handles, outlines) are divided by `unit`, the metres one pixel-ish step is worth at
 * the current zoom.
 */

export type Preview =
  | { kind: "none" }
  | { kind: "marquee"; a: Pt; b: Pt }
  | { kind: "line"; points: Pt[]; dashed?: boolean }
  | { kind: "rect"; a: Pt; b: Pt }
  | { kind: "circle"; center: Pt; radius: number }
  | { kind: "freehand"; points: Pt[] };

export interface OverlayProps {
  scene: Scene;
  selection: Selection;
  /** Objects being dragged by this much (the drag preview). */
  dragDelta: Pt | null;
  preview: Preview;
  guides: readonly SnapGuide[];
  /** Where a dragged tool would land (the drop target), if it is over the court. */
  drop: { at: Pt; valid: boolean } | null;
  /** Court metres per screen "unit" (about a pixel at 100 %), so handles keep their size when zoomed. */
  unit: number;
  /** Bounds of the court, for the guide lines. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** The one selected action, when a single action is selected: its handles are shown. */
  actionHandles: { points: Pt[]; curve: Pt | null } | null;
  /** Highlight the step's own actions? (playback hides all editing chrome). */
  hidden?: boolean;
}

const ACCENT = "var(--accent)";

export function CourtOverlay({
  scene,
  selection,
  dragDelta,
  preview,
  guides,
  drop,
  unit,
  bounds,
  actionHandles,
  hidden,
}: OverlayProps) {
  const u = Math.max(0.0001, unit);
  const moving = (id: string) => (dragDelta && selection.entities.includes(id) ? dragDelta : null);

  return (
    <g data-testid="court-overlay">
      {/* one invisible marker per object: a stable hook for tests and assistive technology (hits are computed, not per-element) */}
      {scene.entities.map((e) => {
        const shift = moving(e.entity.id);
        const x = e.at.x + (shift?.x ?? 0);
        const y = e.at.y + (shift?.y ?? 0);
        return (
          <rect
            key={e.entity.id}
            data-object=""
            data-entity={e.entity.id}
            data-type={
              e.entity.type === "player" ? `${e.entity.type}-${e.entity.side}` : e.entity.type
            }
            x={x - e.halfW}
            y={y - e.halfH}
            width={e.halfW * 2}
            height={e.halfH * 2}
            fill="transparent"
            pointerEvents="none"
            transform={e.rotation ? `rotate(${e.rotation} ${x} ${y})` : undefined}
          />
        );
      })}

      {hidden ? null : (
        <>
          {/* snap guides */}
          {guides.map((g, i) => {
            if (g.kind === "spot")
              return (
                <g key={i} pointerEvents="none">
                  <circle
                    cx={g.at.x}
                    cy={g.at.y}
                    r={0.5}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1.5 * u}
                  />
                  <circle cx={g.at.x} cy={g.at.y} r={0.08} fill={ACCENT} />
                </g>
              );
            if (g.kind === "grid") return null;
            return g.axis === "x" ? (
              <line
                key={i}
                x1={g.value}
                x2={g.value}
                y1={bounds.minY}
                y2={bounds.maxY}
                stroke={ACCENT}
                strokeWidth={1 * u}
                strokeDasharray={`${5 * u} ${4 * u}`}
                opacity={0.7}
                pointerEvents="none"
              />
            ) : (
              <line
                key={i}
                y1={g.value}
                y2={g.value}
                x1={bounds.minX}
                x2={bounds.maxX}
                stroke={ACCENT}
                strokeWidth={1 * u}
                strokeDasharray={`${5 * u} ${4 * u}`}
                opacity={0.7}
                pointerEvents="none"
              />
            );
          })}

          {/* the place a dragged tool will land */}
          {drop ? (
            <g pointerEvents="none" data-testid="drop-target">
              <circle
                cx={drop.at.x}
                cy={drop.at.y}
                r={0.85}
                fill={drop.valid ? ACCENT : "var(--danger)"}
                fillOpacity={0.14}
                stroke={drop.valid ? ACCENT : "var(--danger)"}
                strokeWidth={1.6 * u}
                strokeDasharray={`${5 * u} ${3 * u}`}
              />
            </g>
          ) : null}

          {/* selected objects */}
          {selection.entities.map((id) => {
            const e = scene.entities.find((x) => x.entity.id === id);
            if (!e) return null;
            const shift = moving(id);
            const x = e.at.x + (shift?.x ?? 0);
            const y = e.at.y + (shift?.y ?? 0);
            const round =
              e.entity.type === "player" || e.entity.type === "coach" || e.entity.type === "ball";
            return (
              <g
                key={id}
                pointerEvents="none"
                transform={e.rotation ? `rotate(${e.rotation} ${x} ${y})` : undefined}
              >
                {round ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={e.halfW + 0.12}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={2 * u}
                    strokeDasharray={`${6 * u} ${4 * u}`}
                  />
                ) : (
                  <rect
                    x={x - e.halfW - 0.08}
                    y={y - e.halfH - 0.08}
                    width={(e.halfW + 0.08) * 2}
                    height={(e.halfH + 0.08) * 2}
                    rx={0.1}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={2 * u}
                    strokeDasharray={`${6 * u} ${4 * u}`}
                  />
                )}
              </g>
            );
          })}

          {/* handles of a single selected object: turn (above) and resize (corner) */}
          {selection.entities.length === 1 && selection.actions.length === 0 && !dragDelta
            ? (() => {
                const e = scene.entities.find((x) => x.entity.id === selection.entities[0]);
                if (!e || e.entity.type === "ball") return null;
                const h = handlePoints(e, u);
                return (
                  <g data-testid="object-handles">
                    <line
                      x1={h.rotate.stemFrom.x}
                      y1={h.rotate.stemFrom.y}
                      x2={h.rotate.at.x}
                      y2={h.rotate.at.y}
                      stroke={ACCENT}
                      strokeWidth={1.5 * u}
                      pointerEvents="none"
                    />
                    <circle
                      cx={h.rotate.at.x}
                      cy={h.rotate.at.y}
                      r={6 * u}
                      fill="var(--surface-raised)"
                      stroke={ACCENT}
                      strokeWidth={2 * u}
                      data-handle="rotate"
                    />
                    <rect
                      x={h.resize.x - 5 * u}
                      y={h.resize.y - 5 * u}
                      width={10 * u}
                      height={10 * u}
                      fill="var(--surface-raised)"
                      stroke={ACCENT}
                      strokeWidth={2 * u}
                      data-handle="resize"
                    />
                  </g>
                );
              })()
            : null}

          {/* a selected line: highlighted, with a handle on each point and one to bend it */}
          {selection.actions.map((id) => {
            const a = scene.actions.find((x) => x.id === id);
            if (!a) return null;
            return (
              <polyline
                key={id}
                points={a.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={ACCENT}
                strokeWidth={0.55}
                strokeOpacity={0.28}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            );
          })}
          {actionHandles ? (
            <g data-testid="action-handles">
              {actionHandles.points.slice(1).map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={6 * u}
                  fill="var(--surface-raised)"
                  stroke={ACCENT}
                  strokeWidth={2 * u}
                  data-handle={`point-${i}`}
                />
              ))}
              {actionHandles.curve ? (
                <circle
                  cx={actionHandles.curve.x}
                  cy={actionHandles.curve.y}
                  r={5 * u}
                  fill={ACCENT}
                  stroke="var(--surface-raised)"
                  strokeWidth={1.5 * u}
                  data-handle="curve"
                />
              ) : null}
            </g>
          ) : null}

          {/* what is being drawn */}
          {preview.kind === "marquee" ? (
            <rect
              x={Math.min(preview.a.x, preview.b.x)}
              y={Math.min(preview.a.y, preview.b.y)}
              width={Math.abs(preview.b.x - preview.a.x)}
              height={Math.abs(preview.b.y - preview.a.y)}
              fill={ACCENT}
              fillOpacity={0.1}
              stroke={ACCENT}
              strokeWidth={1.5 * u}
              strokeDasharray={`${5 * u} ${3 * u}`}
              pointerEvents="none"
              data-testid="marquee"
            />
          ) : null}
          {preview.kind === "line" ? (
            <polyline
              points={preview.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={ACCENT}
              strokeWidth={0.14}
              strokeDasharray={preview.dashed === false ? undefined : "0.3 0.2"}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
              data-testid="line-preview"
            />
          ) : null}
          {preview.kind === "rect" ? (
            <rect
              x={Math.min(preview.a.x, preview.b.x)}
              y={Math.min(preview.a.y, preview.b.y)}
              width={Math.abs(preview.b.x - preview.a.x)}
              height={Math.abs(preview.b.y - preview.a.y)}
              fill={ACCENT}
              fillOpacity={0.12}
              stroke={ACCENT}
              strokeWidth={0.06}
              strokeDasharray="0.35 0.25"
              pointerEvents="none"
            />
          ) : null}
          {preview.kind === "circle" ? (
            <circle
              cx={preview.center.x}
              cy={preview.center.y}
              r={preview.radius}
              fill={ACCENT}
              fillOpacity={0.12}
              stroke={ACCENT}
              strokeWidth={0.06}
              strokeDasharray="0.35 0.25"
              pointerEvents="none"
            />
          ) : null}
          {preview.kind === "freehand" ? (
            <polyline
              points={preview.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={ACCENT}
              strokeWidth={0.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ) : null}
        </>
      )}
    </g>
  );
}

/** Where the turn and resize handles of an object sit, for drawing and for hit testing (one function, so they cannot disagree). */
export function handlePoints(
  e: { at: Pt; halfW: number; halfH: number; rotation: number },
  unit: number,
): { rotate: { at: Pt; stemFrom: Pt }; resize: Pt } {
  const rad = (e.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (x: number, y: number): Pt => ({
    x: e.at.x + x * cos - y * sin,
    y: e.at.y + x * sin + y * cos,
  });
  const reach = 22 * unit;
  return {
    rotate: { at: rot(0, -(e.halfH + 0.08) - reach), stemFrom: rot(0, -(e.halfH + 0.08)) },
    resize: rot(e.halfW + 0.08, e.halfH + 0.08),
  };
}
