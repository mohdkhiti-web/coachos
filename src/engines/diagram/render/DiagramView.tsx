import { useId } from "react";
import { describeDiagram } from "../describe";
import type { CourtPack, Pt } from "../pack";
import {
  PLAYER_RADIUS,
  resolveDiagram,
  type ResolvedAction,
  type ResolvedEntity,
} from "../resolve";
import type { Diagram } from "../schema";
import { arrowHead, endDirection, n, pointsAttr, tBar, trim, wavy } from "./geometry";
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
}

const STROKE = { court: 0.06, arrow: 0.13, thin: 0.085 } as const;
const DASH = {
  dashed: "0.35 0.25",
  pass: "0.42 0.28",
  faint: "0.12 0.18",
  shot: "0.03 0.24",
} as const;

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
}: DiagramViewProps) {
  const uid = useId();
  const { resolved } = resolveDiagram(diagram, pack);
  const p = PALETTES[theme];
  const { minX, maxX, minY, maxY } = pack.bounds;
  const m = pack.margin;
  const view = { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
  const multiStep = resolved.steps.length > 1;

  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-labelledby": `${uid}-t ${uid}-d` } as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${n(view.x)} ${n(view.y)} ${n(view.w)} ${n(view.h)}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      focusable="false"
      {...a11y}
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
                fill={p.zone}
                fillOpacity={0.12}
                stroke={p.zone}
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
                fill={p.zone}
                fillOpacity={0.12}
                stroke={p.zone}
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

      {/* court markings */}
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

      {/* actions under players */}
      {resolved.actions.map((ra) => (
        <ActionShape key={ra.action.id} ra={ra} p={p} badge={multiStep} animated={animated} />
      ))}

      {resolved.entities.map((re) => (
        <EntityShape key={re.entity.id} re={re} p={p} animated={animated} />
      ))}

      {resolved.annotations.map(({ annotation: a, a: pa }, i) =>
        a.type === "text" ? <Label key={`t${i}`} at={pa} p={p} text={a.text} size={0.55} /> : null,
      )}
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
}: {
  at: Pt;
  p: Palette;
  text: string;
  size: number;
  fill?: string;
  anchor?: "start" | "middle";
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
      style={{ userSelect: "none" }}
    >
      {text}
    </text>
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
  switch (e.type) {
    case "player":
      return e.side === "offense" ? (
        <g className={fadeIn}>
          <circle
            className={move}
            cx={n(at.x)}
            cy={n(at.y)}
            r={r}
            fill={p.offense}
            stroke={p.arrow}
            strokeWidth={0.05}
          />
          {e.label ? <Label at={at} p={p} text={e.label} size={0.5} fill={p.offenseInk} /> : null}
        </g>
      ) : (
        // defenders are squares: distinguishable from offence without relying on colour
        <g className={fadeIn}>
          <rect
            className={move}
            x={n(at.x - r * 0.9)}
            y={n(at.y - r * 0.9)}
            width={n(r * 1.8)}
            height={n(r * 1.8)}
            rx={0.08}
            fill={p.defenseFill}
            stroke={p.defense}
            strokeWidth={0.09}
          />
          {e.label ? <Label at={at} p={p} text={e.label} size={0.5} /> : null}
        </g>
      );
    case "coach":
      return (
        <g className={fadeIn}>
          <circle className={move} cx={n(at.x)} cy={n(at.y)} r={r} fill={p.coach} />
          <Label at={at} p={p} text={e.label ?? "C"} size={0.5} fill={p.coachInk} />
        </g>
      );
    case "ball":
      // the crosshair `path` cannot tween with the circle, so the ball only fades in on mount; it does not
      // glide (a rare movement in practice — the ball normally travels as a pass/dribble action, not a move).
      return (
        <g className={fadeIn}>
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
        </g>
      );
    case "cone":
      return (
        <polygon
          className={fadeIn}
          points={pointsAttr([
            { x: at.x, y: at.y - 0.32 },
            { x: at.x + 0.28, y: at.y + 0.22 },
            { x: at.x - 0.28, y: at.y + 0.22 },
          ])}
          fill={p.cone}
          stroke={p.arrow}
          strokeWidth={0.04}
          strokeLinejoin="round"
        />
      );
    case "marker":
      return (
        <g className={fadeIn}>
          <polygon
            points={pointsAttr([
              { x: at.x, y: at.y - 0.42 },
              { x: at.x + 0.42, y: at.y },
              { x: at.x, y: at.y + 0.42 },
              { x: at.x - 0.42, y: at.y },
            ])}
            fill={e.kind === "end" ? p.badge : p.surface}
            stroke={p.badge}
            strokeWidth={0.07}
          />
          <Label
            at={at}
            p={p}
            text={e.label ?? (e.kind === "start" ? "S" : e.kind === "end" ? "E" : "")}
            size={0.4}
            fill={e.kind === "end" ? p.badgeInk : p.text}
          />
        </g>
      );
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
  const line = trim(ra.points, ra.startCut, ra.endCut);
  if (line.length < 2) return null;
  const tip = line[line.length - 1]!;
  const dir = endDirection(line);

  let body: React.ReactNode;
  switch (a.type) {
    case "pass":
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={p.arrow}
            strokeWidth={STROKE.arrow}
            strokeDasharray={DASH.pass}
            strokeLinecap="butt"
          />
          <polygon points={arrowHead(tip, dir)} fill={p.arrow} />
        </>
      );
      break;
    case "shot":
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={p.arrow}
            strokeWidth={0.1}
            strokeDasharray={DASH.shot}
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.44, 0.24)} fill={p.arrow} />
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
            stroke={p.arrow}
            strokeWidth={STROKE.thin}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon
            points={arrowHead(tip, endDirection(wave.length > 1 ? wave : line))}
            fill={p.arrow}
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
            stroke={p.arrow}
            strokeWidth={STROKE.arrow}
            strokeLinecap="round"
          />
          <line
            x1={n(b1.x)}
            y1={n(b1.y)}
            x2={n(b2.x)}
            y2={n(b2.y)}
            stroke={p.arrow}
            strokeWidth={0.2}
            strokeLinecap="round"
          />
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
            stroke={p.arrow}
            strokeWidth={STROKE.thin}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.44, 0.24)} fill={p.arrow} />
        </>
      );
      break;
    default: // cut: the boldest movement line
      body = (
        <>
          <polyline
            points={pointsAttr(line)}
            fill="none"
            stroke={p.arrow}
            strokeWidth={0.17}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHead(tip, dir, 0.56, 0.31)} fill={p.arrow} />
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
    <g className={animated ? "animate-fade-in" : undefined}>
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
