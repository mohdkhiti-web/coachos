import {
  ArrowRight,
  Circle,
  Crosshair,
  Check,
  Highlighter,
  Pencil,
  Shield,
  Spline,
  Square,
  Type,
  Waves,
  X,
  Zap,
  Route,
  Target,
  Undo2,
  Scan,
  MoveRight,
  ArrowRightLeft,
  Layers,
  CornerDownRight,
} from "lucide-react";
import { EQUIPMENT, EquipmentGlyph, PALETTES, type EquipmentKind } from "@/engines/diagram";
import type { ToolDef } from "./tools";

const p = PALETTES.screen;

/** A tool's picture: placeable things are drawn as they look on the court; drawing tools get a line-style icon. */
export function ToolGlyph({ tool, size = 30 }: { tool: ToolDef; size?: number }) {
  const spec = tool.place;
  if (spec) {
    if (spec.kind === "equipment") return <Equip kind={spec.equipment} size={size} />;
    return (
      <svg viewBox="-1 -1 2 2" width={size} height={size} aria-hidden focusable="false">
        {spec.kind === "player" && spec.side === "offense" ? (
          <>
            <circle r={0.72} fill={p.offense} stroke={p.arrow} strokeWidth={0.07} />
            <text
              y={0.02}
              fontSize={0.9}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill={p.offenseInk}
            >
              {spec.numbered ? "7" : "1"}
            </text>
            {spec.withBall ? (
              <circle
                cx={0.7}
                cy={-0.62}
                r={0.3}
                fill={p.ball}
                stroke={p.arrow}
                strokeWidth={0.07}
              />
            ) : null}
          </>
        ) : null}
        {spec.kind === "player" && spec.side === "defense" ? (
          <>
            <rect
              x={-0.66}
              y={-0.66}
              width={1.32}
              height={1.32}
              rx={0.1}
              fill={p.defenseFill}
              stroke={p.defense}
              strokeWidth={0.13}
            />
            <text
              y={0.02}
              fontSize={0.8}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill={p.text}
            >
              X1
            </text>
          </>
        ) : null}
        {spec.kind === "coach" ? (
          <>
            <circle r={0.72} fill={p.coach} />
            <text
              y={0.02}
              fontSize={0.9}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill={p.coachInk}
            >
              C
            </text>
          </>
        ) : null}
        {spec.kind === "ball" ? (
          <>
            <circle r={0.62} fill={p.ball} stroke={p.arrow} strokeWidth={0.09} />
            <path
              d="M -0.62 0 H 0.62 M 0 -0.62 V 0.62"
              stroke={p.arrow}
              strokeWidth={0.07}
              fill="none"
            />
          </>
        ) : null}
        {spec.kind === "cone" ? <ConeIcon spec={spec} /> : null}
      </svg>
    );
  }
  const d = tool.draw!;
  const cls = "text-ink";
  const s = { width: size * 0.8, height: size * 0.8 };
  switch (d.mode) {
    case "path":
      if (d.type === "defend") return <Shield className={cls} style={s} aria-hidden />;
      if (d.type === "dribble") return <Waves className={cls} style={s} aria-hidden />;
      if (d.type === "sprint") return <Zap className={cls} style={s} aria-hidden />;
      if (d.type === "cut") return <CornerDownRight className={cls} style={s} aria-hidden />;
      return d.curve ? (
        <Spline className={cls} style={s} aria-hidden />
      ) : (
        <MoveRight className={cls} style={s} aria-hidden />
      );
    case "pass":
      return d.kind === "standard" ? (
        <ArrowRight className={cls} style={s} aria-hidden />
      ) : d.kind === "bounce" ? (
        <Undo2 className={`${cls} rotate-[135deg]`} style={s} aria-hidden />
      ) : d.kind === "skip" ? (
        <ArrowRightLeft className={cls} style={s} aria-hidden />
      ) : (
        <Route className={cls} style={s} aria-hidden />
      );
    case "shot":
      return <Target className={cls} style={s} aria-hidden />;
    case "screen":
      return <Layers className={cls} style={s} aria-hidden />;
    case "text":
      return <Type className={cls} style={s} aria-hidden />;
    case "mark":
      return d.kind === "x" ? (
        <X className="text-danger" style={s} aria-hidden />
      ) : (
        <Check className="text-success" style={s} aria-hidden />
      );
    case "zone":
      return <Square className={cls} style={s} aria-hidden />;
    case "circle":
      return d.color ? (
        <Highlighter className={cls} style={s} aria-hidden />
      ) : (
        <Circle className={cls} style={s} aria-hidden />
      );
    case "freehand":
      return <Pencil className={cls} style={s} aria-hidden />;
    default:
      return <Crosshair className={cls} style={s} aria-hidden />;
  }
}

function Equip({ kind, size }: { kind: EquipmentKind; size: number }) {
  const { w, h } = EQUIPMENT[kind];
  const pad = 0.14;
  return (
    <svg
      viewBox={`${-w / 2 - pad} ${-h / 2 - pad} ${w + pad * 2} ${h + pad * 2}`}
      width={size * 1.3}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      <EquipmentGlyph kind={kind} p={p} />
    </svg>
  );
}

function ConeIcon({ spec }: { spec: { variant?: string; color?: string; numbered?: boolean } }) {
  const fill = spec.color === "yellow" ? p.named.yellow.fill : p.cone;
  if (spec.variant === "disc")
    return <circle r={0.6} fill={fill} stroke={p.arrow} strokeWidth={0.09} />;
  if (spec.variant === "flat")
    return (
      <rect
        x={-0.55}
        y={-0.55}
        width={1.1}
        height={1.1}
        rx={0.1}
        fill={fill}
        stroke={p.arrow}
        strokeWidth={0.09}
      />
    );
  const tall = spec.variant === "tall";
  return (
    <>
      <polygon
        points={tall ? "0,-0.95 0.5,0.7 -0.5,0.7" : "0,-0.72 0.72,0.6 -0.72,0.6"}
        fill={fill}
        stroke={p.arrow}
        strokeWidth={0.09}
        strokeLinejoin="round"
      />
      {spec.numbered ? (
        <text
          y={0.22}
          fontSize={0.6}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
          fill={p.offenseInk}
        >
          3
        </text>
      ) : null}
    </>
  );
}

export { Scan };
