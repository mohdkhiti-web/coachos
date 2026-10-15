import { memo, useId, type ReactNode, type SVGProps } from "react";
import { describeDiagram } from "../describe";
import { EQUIPMENT } from "../equipment";
import type { CourtPack, Pt } from "../pack";
import { holdersAtStep } from "../steps";
import {
  BALL_OFFSET,
  PLAYER_RADIUS,
  resolveDiagram,
  type ResolvedAction,
  type ResolvedEntity,
} from "../resolve";
import type { Diagram, DiagramColor } from "../schema";
import { EquipmentGlyph } from "./glyphs";
import {
  arrowHead,
  endDirection,
  n,
  pointAlong,
  pointsAttr,
  sampleCurve,
  tBar,
  trim,
  wavy,
} from "./geometry";
import { PALETTES, type DiagramTheme, type Palette } from "./palette";

export interface DiagramViewProps {
  diagram: Diagram;
  pack: CourtPack;
  theme?: DiagramTheme;
  /** Accessible name. Defaults to the court label. */
  title?: string;
  /** Purely decorative (e.g. a card thumbnail beside a text link): hidden from assistive tech. */
  decorative?: boolean;
  /**
   * Opt-in transitions for the interactive diagram editor only — never the default. A moved player glides
   * (SVG `cx`/`cy`/`x`/`y` are the only position attributes that tween smoothly); a newly added player,
   * cone, marker or action arrow fades in. Off by default so print/PDF/PNG export and golden-image tests,
   * which reuse this same renderer, stay exactly as deterministic as before.
   */
  animated?: boolean;
  className?: string;
  /**
   * Show ONE step of a multi-step drill: everyone stands where that step starts (and the ball is with whoever holds it
   * then), that step's actions are drawn in full, earlier steps' actions faintly, later steps' not at all.
   */
  step?: number;
  /** Where things stand right now, by id — used by playback to slide players and balls along their paths. */
  positions?: ReadonlyMap<string, Pt>;
  /** Draw only these actions (by id). Absent = the step rule above (or all of them). */
  visibleActions?: ReadonlySet<string>;
  /** Draw no action lines at all (playback shows movement itself). */
  hideActions?: boolean;
  /** Replace the viewBox (zoom and pan). */
  viewBox?: string;
  /** Attributes for the `<svg>` itself: a ref, pointer handlers, a test id — for the editor's interactive court. */
  svgProps?: Omit<SVGProps<SVGSVGElement>, "viewBox" | "className" | "xmlns"> & {
    [attribute: `data-${string}`]: string | undefined;
  };
  /** Drawn on top of everything, in court metres: selection, snap guides, the drop target, a marquee. */
  overlay?: ReactNode;
}

const STROKE = { court: 0.06, arrow: 0.13, thin: 0.085 } as const;
const DASH = {
  dashed: "0.35 0.25",
  pass: "0.42 0.28",
  faint: "0.12 0.18",
  shot: "0.03 0.24",
  skip: "0.9 0.3",
  overhead: "0.04 0.22",
} as const;
const WEIGHT = { thin: 0.65, normal: 1, thick: 1.6 } as const;

/**
 * Pure SVG renderer (ARCHITECTURE.md §10.1–10.2): vector-crisp at any size, server-renderable, and
 * deterministic (stable numeric formatting) so golden tests and print exports are reliable.
 * Metre coordinates go straight into the viewBox; the browser does the scaling.
 */
export function DiagramView({
  diagram,
  pack,
  theme = "screen",
  title,
  decorative = false,
  animated = false,
  className,
  step,
  positions,
  visibleActions,
  hideActions = false,
  viewBox,
  svgProps,
  overlay,
}: DiagramViewProps) {
  const uid = useId();
  const { resolved } = resolveDiagram(diagram, pack);
  const p = PALETTES[theme];
  const { minX, maxX, minY, maxY } = pack.bounds;
  const m = pack.margin;
  const view = { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
  const multiStep = resolved.steps.length > 1;

  // Where everything stands: the resolved start, moved to where the shown step begins, then to any playback position.
  const stepStart = step !== undefined ? resolved.stepStarts.get(step) : undefined;
  const holders = step !== undefined ? holdersAtStep(diagram, step) : undefined;
  const placed = new Map<string, Pt>();
  for (const re of resolved.entities) placed.set(re.entity.id, re.at);
  if (stepStart) for (const [id, at] of stepStart) placed.set(id, at);
  if (holders)
    for (const [ball, holder] of holders) {
      const at = placed.get(holder);
      if (at) placed.set(ball, { x: at.x + BALL_OFFSET.x, y: at.y + BALL_OFFSET.y });
    }
  if (positions) for (const [id, at] of positions) placed.set(id, at);
  const entities = resolved.entities.map((re) => ({
    ...re,
    at: placed.get(re.entity.id) ?? re.at,
  }));

  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-labelledby": `${uid}-t ${uid}-d` } as const);

  const actionOpacity = (ra: ResolvedAction): number | null => {
    if (hideActions) return null;
    if (visibleActions) return visibleActions.has(ra.action.id) ? 1 : null;
    if (step === undefined) return 1;
    if (ra.step > step) return null;
    return ra.step === step ? 1 : 0.28;
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox ?? `${n(view.x)} ${n(view.y)} ${n(view.w)} ${n(view.h)}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      focusable="false"
      {...a11y}
      {...svgProps}
    >
      {decorative ? null : (
        <>
          <title id={`${uid}-t`}>{title ?? pack.label}</title>
          <desc id={`${uid}-d`}>{describeDiagram(diagram)}</desc>
        </>
      )}

      <rect x={n(view.x)} y={n(view.y)} width={n(view.w)} height={n(view.h)} fill={p.surface} />

      {/* zones sit under everything */}
      {resolved.annotations.map(({ annotation: a, a: pa, b: pb }, i) => {
        const zone = "color" in a && a.color ? p.named[a.color].fill : p.zone;
        if (a.type === "zone_rect" && pb) {
          const x = Math.min(pa.x, pb.x);
          const y = Math.min(pa.y, pb.y);
          return (
            <g key={`z${i}`}>
              <rect
                x={n(x)}
                y={n(y)}
                width={n(Math.abs(pb.x - pa.x))}
                height={n(Math.abs(pb.y - pa.y))}
                fill={zone}
                fillOpacity={0.12}
                stroke={zone}
                strokeWidth={0.06}
                strokeDasharray={DASH.dashed}
              />
              {a.label ? (
                <Label
                  at={{ x: x + 0.25, y: y + 0.55 }}
                  p={p}
                  text={a.label}
                  size={0.46}
                  anchor="start"
                />
              ) : null}
            </g>
          );
        }
        if (a.type === "zone_circle") {
          return (
            <g key={`z${i}`}>
              <circle
                cx={n(pa.x)}
                cy={n(pa.y)}
                r={n(a.radius)}
                fill={zone}
                fillOpacity={0.12}
                stroke={zone}
                strokeWidth={0.06}
                strokeDasharray={DASH.dashed}
              />
              {a.label ? (
                <Label at={{ x: pa.x, y: pa.y }} p={p} text={a.label} size={0.46} />
              ) : null}
            </g>
          );
        }
        return null;
      })}

      {/* court markings: they never change while a drill is edited, so they are drawn once */}
      <CourtMarkings pack={pack} p={p} />

      {/* equipment lies on the floor: under players and lines */}
      {entities
        .filter((re) => re.entity.type === "equipment")
        .map((re) => (
          <EntityShape key={re.entity.id} re={re} p={p} animated={animated} />
        ))}

      {/* actions under players */}
      {resolved.actions.map((ra) => {
        const opacity = actionOpacity(ra);
        if (opacity === null) return null;
        const shape = (
          <ActionShape
            key={ra.action.id}
            ra={ra}
            p={p}
            badge={multiStep && step === undefined}
            animated={animated}
          />
        );
        return opacity === 1 ? (
          shape
        ) : (
          <g key={ra.action.id} opacity={opacity}>
            {shape}
          </g>
        );
      })}

      {entities
        .filter((re) => re.entity.type !== "equipment")
        .map((re) => (
          <EntityShape key={re.entity.id} re={re} p={p} animated={animated} />
        ))}

      {resolved.annotations.map(({ annotation: a, a: pa, points }, i) => {
        if (a.type === "text")
          return (
            <Label
              key={`t${i}`}
              at={pa}
              p={p}
              text={a.text}
              size={0.55}
              fill={a.color ? p.named[a.color].fill : undefined}
              halo={p.surface}
            />
          );
        if (a.type === "mark")
          return <Mark key={`m${i}`} at={pa} kind={a.kind} color={a.color} p={p} />;
        if (a.type === "freehand" && points)
          return (
            <polyline
              key={`f${i}`}
              points={pointsAttr(points)}
              fill="none"
              stroke={a.color ? p.named[a.color].fill : p.arrow}
              strokeWidth={0.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        return null;
      })}

      {overlay}
    </svg>
  );
}

function Label({
  at,
  p,
  text,
  size,
  fill,
  anchor = "middle",
  halo,
}: {
  at: Pt;
  p: Palette;
  text: string;
  size: number;
  fill?: string;
  anchor?: "start" | "middle";
  /** A surface-coloured outline behind the letters, so a note stays readable over lines. */
  halo?: string;
}) {
  return (
    <text
      x={n(at.x)}
      y={n(at.y)}
      fontSize={size}
      fontWeight={600}
      fontFamily={p.font}
      textAnchor={anchor}
      dominantBaseline="central"
      fill={fill ?? p.text}
      stroke={halo}
      strokeWidth={halo ? size * 0.22 : undefined}
      paintOrder={halo ? "stroke" : undefined}
      style={{ userSelect: "none" }}
    >
      {text}
    </text>
  );
}

function Mark({
  at,
  kind,
  color,
  p,
}: {
  at: Pt;
  kind: "x" | "check";
  color?: DiagramColor;
  p: Palette;
}) {
  const c = color ? p.named[color].fill : kind === "x" ? "#dc2626" : "#15803d";
  const r = 0.38;
  return kind === "x" ? (
    <path
      d={`M ${n(at.x - r)} ${n(at.y - r)} L ${n(at.x + r)} ${n(at.y + r)} M ${n(at.x + r)} ${n(at.y - r)} L ${n(at.x - r)} ${n(at.y + r)}`}
      stroke={c}
      strokeWidth={0.14}
      strokeLinecap="round"
      fill="none"
    />
  ) : (
    <path
      d={`M ${n(at.x - r)} ${n(at.y)} L ${n(at.x - r * 0.25)} ${n(at.y + r * 0.7)} L ${n(at.x + r)} ${n(at.y - r * 0.7)}`}
      stroke={c}
      strokeWidth={0.14}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

/** A group turned and scaled about the entity's own centre; no wrapper at all when it has neither (legacy output is untouched). */
function Placed({
  at,
  rotation,
  scale,
  className,
  children,
}: {
  at: Pt;
  rotation?: number;
  scale?: number;
  className?: string;
  children: ReactNode;
}) {
  if (!rotation && (!scale || scale === 1)) return <g className={className}>{children}</g>;
  const parts = [`translate(${n(at.x)} ${n(at.y)})`];
  if (rotation) parts.push(`rotate(${rotation})`);
  if (scale && scale !== 1) parts.push(`scale(${scale})`);
  parts.push(`translate(${n(-at.x)} ${n(-at.y)})`);
  return (
    <g className={className} transform={parts.join(" ")}>
      {children}
    </g>
  );
}

function EntityShape({ re, p, animated }: { re: ResolvedEntity; p: Palette; animated: boolean }) {
  const { entity: e, at } = re;
  const r = PLAYER_RADIUS;
  // `points` (polygon) does not tween smoothly across browsers, so only circle/rect entities — whose position
  // is `cx`/`cy` or `x`/`y` — get the glide-to-new-spot transition; every entity still gets the mount fade
  // (on the wrapping `<g>`, so it is never stacked with the move transition on the same element).
  const move = animated ? "diagram-move" : undefined;
  const fadeIn = animated ? "animate-fade-in" : undefined;
  const named = "color" in e && e.color ? p.named[e.color] : undefined;
  const scale = "scale" in e ? e.scale : undefined;
  const rotation = "rotation" in e ? e.rotation : undefined;
  switch (e.type) {
    case "player": {
      const facing = rotation ? (
        <polygon
          points={pointsAttr([
            { x: at.x, y: at.y - r - 0.2 },
            { x: at.x + 0.15, y: at.y - r + 0.02 },
            { x: at.x - 0.15, y: at.y - r + 0.02 },
          ])}
          fill={p.arrow}
          transform={`rotate(${rotation} ${n(at.x)} ${n(at.y)})`}
        />
      ) : null;
      return e.side === "offense" ? (
        <Placed at={at} scale={scale} className={fadeIn}>
          <circle
            className={move}
            cx={n(at.x)}
            cy={n(at.y)}
            r={r}
            fill={named?.fill ?? p.offense}
            stroke={p.arrow}
            strokeWidth={0.05}
          />
          {e.label ? (
            <Label at={at} p={p} text={e.label} size={0.5} fill={named?.ink ?? p.offenseInk} />
          ) : null}
          {facing}
        </Placed>
      ) : (
        // defenders are squares: distinguishable from offence without relying on colour
        <Placed at={at} scale={scale} className={fadeIn}>
          <rect
            className={move}
            x={n(at.x - r * 0.9)}
            y={n(at.y - r * 0.9)}
            width={n(r * 1.8)}
            height={n(r * 1.8)}
            rx={0.08}
            fill={named ? named.fill : p.defenseFill}
            stroke={named ? p.arrow : p.defense}
            strokeWidth={0.09}
          />
          {e.label ? <Label at={at} p={p} text={e.label} size={0.5} fill={named?.ink} /> : null}
          {facing}
        </Placed>
      );
    }
    case "coach":
      return (
        <Placed at={at} scale={scale} className={fadeIn}>
          <circle className={move} cx={n(at.x)} cy={n(at.y)} r={r} fill={named?.fill ?? p.coach} />
          <Label at={at} p={p} text={e.label ?? "C"} size={0.5} fill={named?.ink ?? p.coachInk} />
        </Placed>
      );
    case "ball": {
      // the crosshair `path` cannot tween with the circle, so the ball only fades in on mount; it does not
      // glide (a rare movement in practice — the ball normally travels as a pass/dribble action, not a move).
      return (
        <Placed at={at} scale={scale} className={fadeIn}>
          <circle
            cx={n(at.x)}
            cy={n(at.y)}
            r={0.22}
            fill={p.ball}
            stroke={p.arrow}
            strokeWidth={0.05}
          />
          <path
            d={`M ${n(at.x - 0.22)} ${n(at.y)} H ${n(at.x + 0.22)} M ${n(at.x)} ${n(at.y - 0.22)} V ${n(at.y + 0.22)}`}
            stroke={p.arrow}
            strokeWidth={0.035}
            fill="none"
          />
        </Placed>
      );
    }
    case "cone": {
      const fill = named?.fill ?? p.cone;
      const variant = e.variant ?? "standard";
      const body =
        variant === "disc" ? (
          <circle
            cx={n(at.x)}
            cy={n(at.y)}
            r={0.24}
            fill={fill}
            stroke={p.arrow}
            strokeWidth={0.04}
          />
        ) : variant === "flat" ? (
          <rect
            x={n(at.x - 0.22)}
            y={n(at.y - 0.22)}
            width={0.44}
            height={0.44}
            rx={0.05}
            fill={fill}
            stroke={p.arrow}
            strokeWidth={0.04}
          />
        ) : (
          <polygon
            points={pointsAttr(
              variant === "tall"
                ? [
                    { x: at.x, y: at.y - 0.5 },
                    { x: at.x + 0.22, y: at.y + 0.26 },
                    { x: at.x - 0.22, y: at.y + 0.26 },
                  ]
                : [
                    { x: at.x, y: at.y - 0.32 },
                    { x: at.x + 0.28, y: at.y + 0.22 },
                    { x: at.x - 0.28, y: at.y + 0.22 },
                  ],
            )}
            fill={fill}
            stroke={p.arrow}
            strokeWidth={0.04}
            strokeLinejoin="round"
          />
        );
      if (!e.label && !rotation && (!scale || scale === 1) && !e.variant && !named)
        return <g className={fadeIn}>{body}</g>;
      return (
        <Placed at={at} rotation={rotation} scale={scale} className={fadeIn}>
          {body}
          {e.label ? (
            <Label
              at={{ x: at.x, y: at.y + (variant === "disc" || variant === "flat" ? 0 : 0.06) }}
              p={p}
              text={e.label}
              size={0.3}
              fill={named?.ink ?? p.offenseInk}
            />
          ) : null}
        </Placed>
      );
    }
    case "marker":
      return (
        <Placed at={at} rotation={rotation} scale={scale} className={fadeIn}>
          <polygon
            points={pointsAttr([
              { x: at.x, y: at.y - 0.42 },
              { x: at.x + 0.42, y: at.y },
              { x: at.x, y: at.y + 0.42 },
              { x: at.x - 0.42, y: at.y },
            ])}
            fill={e.kind === "end" ? (named?.fill ?? p.badge) : p.surface}
            stroke={named?.fill ?? p.badge}
            strokeWidth={0.07}
          />
          <Label
            at={at}
            p={p}
            text={e.label ?? (e.kind === "start" ? "S" : e.kind === "end" ? "E" : "")}
            size={0.4}
            fill={e.kind === "end" ? (named?.ink ?? p.badgeInk) : p.text}
          />
        </Placed>
      );
    case "equipment": {
      const spec = EQUIPMENT[e.kind];
      return (
        <g className={fadeIn}>
          <g
            transform={`translate(${n(at.x)} ${n(at.y)})${rotation ? ` rotate(${rotation})` : ""}${scale && scale !== 1 ? ` scale(${scale})` : ""}`}
          >
            <EquipmentGlyph
              kind={e.kind}
              p={p}
              fill={named?.fill}
              ink={named ? p.arrow : undefined}
            />
          </g>
          {e.label ? (
            <Label
              at={{ x: at.x, y: at.y + (spec.h * (scale ?? 1)) / 2 + 0.32 }}
              p={p}
              text={e.label}
              size={0.34}
              halo={p.surface}
            />
          ) : null}
        </g>
      );
    }
  }
}

function ActionShape({
  ra,
  p,
  badge,
  animated,
}: {
  ra: ResolvedAction;
  p: Palette;
  badge: boolean;
  animated: boolean;
}) {
  const { action: a } = ra;
  const curve = "curve" in a ? (a.curve ?? 0) : 0;
  const weight = "weight" in a && a.weight ? WEIGHT[a.weight] : 1;
  const ink = "color" in a && a.color ? p.named[a.color].fill : p.arrow;
  const straight = trim(ra.points, ra.startCut, ra.endCut);
  if (straight.length < 2) return null;
  const line = curve ? trim(sampleCurve(ra.points, curve), ra.startCut, ra.endCut) : straight;
  const tip = line[line.length - 1]!;
  const dir = endDirection(line);
  const w = (v: number) => n(v * weight);

  let body: React.ReactNode;
  switch (a.type) {
    case "pass": {
      const kind = a.kind ?? "standard";
      const mid = pointAlong(line, 0.5);
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(STROKE.arrow)}
            strokeDasharray={
              kind === "skip" ? DASH.skip : kind === "overhead" ? DASH.overhead : DASH.pass
            }
            strokeLinecap={kind === "overhead" ? "round" : "butt"}
          />
          {kind === "bounce" ? (
            <circle
              cx={n(mid.x)}
              cy={n(mid.y)}
              r={0.2}
              fill={p.surface}
              stroke={ink}
              strokeWidth={0.07}
            />
          ) : null}
          <polygon points={arrowHead(tip, dir)} fill={ink} />
          {kind === "skip" ? <polygon points={arrowHead(mid, dir, 0.4, 0.22)} fill={ink} /> : null}
        </>
      );
      break;
    }
    case "shot":
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(0.1)}
            strokeDasharray={DASH.shot}
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.44, 0.24)} fill={ink} />
        </>
      );
      break;
    case "dribble": {
      const wave = wavy(line);
      body = (
        <>
          <polyline
            points={pointsAttr(wave)}
            fill="none"
            stroke={ink}
            strokeWidth={w(STROKE.thin)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon
            points={arrowHead(tip, endDirection(wave.length > 1 ? wave : line))}
            fill={ink}
          />
        </>
      );
      break;
    }
    case "screen": {
      const [b1, b2] = tBar(tip, dir);
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(STROKE.arrow)}
            strokeLinecap="round"
          />
          <line
            x1={n(b1.x)}
            y1={n(b1.y)}
            x2={n(b2.x)}
            y2={n(b2.y)}
            stroke={ink}
            strokeWidth={w(0.2)}
            strokeLinecap="round"
          />
          {a.kind ? (
            <Label
              at={{ x: tip.x + dir.x * 0.75, y: tip.y + dir.y * 0.75 }}
              p={p}
              text={a.kind}
              size={0.34}
              halo={p.surface}
            />
          ) : null}
        </>
      );
      break;
    }
    case "move":
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(STROKE.thin)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.44, 0.24)} fill={ink} />
        </>
      );
      break;
    case "sprint": {
      // a sprint is a cut with a second arrowhead: "faster than a cut"
      const back = { x: tip.x - dir.x * 0.42, y: tip.y - dir.y * 0.42 };
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(0.17)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.5, 0.29)} fill={ink} />
          <polygon points={arrowHead(back, dir, 0.5, 0.29)} fill={ink} />
        </>
      );
      break;
    }
    case "defend": {
      const mid = pointAlong(line, 0.5);
      const off = { x: -dir.y * 0.5, y: dir.x * 0.5 };
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(STROKE.thin + 0.02)}
            strokeDasharray={DASH.dashed}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.44, 0.24)} fill={ink} />
          <Label
            at={{ x: mid.x + off.x, y: mid.y + off.y }}
            p={p}
            text={a.kind}
            size={0.34}
            halo={p.surface}
          />
        </>
      );
      break;
    }
    default: // cut: the boldest movement line
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={ink}
            strokeWidth={w(0.17)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.56, 0.31)} fill={ink} />
        </>
      );
  }

  // numbered step badge beside the start of the line (only when there is more than one step)
  const s0 = line[0]!;
  const s1 = line[1]!;
  const l = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1;
  const badgeAt = {
    x: s0.x + ((s1.x - s0.x) / l) * 0.55 + (-(s1.y - s0.y) / l) * 0.42,
    y: s0.y + ((s1.y - s0.y) / l) * 0.55 + ((s1.x - s0.x) / l) * 0.42,
  };

  return (
    // A new pass/dribble/screen/cut/shot arrow fades in; `points` isn't smoothly tweenable, so an edited
    // arrow's path just redraws — it does not glide the way a moved player does.
    <g className={animated ? "animate-fade-in" : undefined} data-action={ra.action.id}>
      {body}
      {badge ? (
        <g>
          <circle cx={n(badgeAt.x)} cy={n(badgeAt.y)} r={0.27} fill={p.badge} />
          <Label at={badgeAt} p={p} text={String(ra.step)} size={0.36} fill={p.badgeInk} />
        </g>
      ) : null}
    </g>
  );
}

/** The lines of the court. Memoised: dragging an object re-renders the diagram on every frame, but the court does not change. */
const CourtMarkings = memo(function CourtMarkings({ pack, p }: { pack: CourtPack; p: Palette }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {pack.primitives.map((c, i) => (
        <path
          key={i}
          d={c.d}
          transform={c.transform}
          fill={c.fill === "surface" ? p.surface : "none"}
          stroke={c.stroke === "faint" ? p.courtFaint : p.court}
          strokeWidth={STROKE.court}
          strokeDasharray={c.stroke === "dashed" ? DASH.dashed : undefined}
        />
      ))}
    </g>
  );
});
