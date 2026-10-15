import { EQUIPMENT } from "../equipment";
import type { EquipmentKind } from "../schema";
import { n } from "./geometry";
import type { Palette } from "./palette";

/**
 * Top-down glyphs for training equipment, drawn around (0, 0) with the long side along x. The caller moves, turns and scales
 * the group; a glyph only knows its own shape. Deliberately simple: a coach recognises a ladder by its rungs and a hoop by its
 * rim, and a cluttered symbol is unreadable at the size of a printed drill sheet.
 */
export function EquipmentGlyph({
  kind,
  p,
  fill,
  ink,
}: {
  kind: EquipmentKind;
  p: Palette;
  /** A colour the coach picked (else the neutral equipment fill). */
  fill?: string;
  ink?: string;
}) {
  const { w, h } = EQUIPMENT[kind];
  const body = fill ?? p.equipFill;
  const line = ink ?? p.equip;
  const sw = 0.06;
  const hw = w / 2;
  const hh = h / 2;

  switch (kind) {
    case "ladder":
    case "ladder_short":
    case "ladder_long": {
      const rungs = Math.max(2, Math.floor(w / 0.45));
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          {Array.from({ length: rungs - 1 }, (_, i) => {
            const x = -hw + ((i + 1) * w) / rungs;
            return (
              <line
                key={i}
                x1={n(x)}
                y1={n(-hh)}
                x2={n(x)}
                y2={n(hh)}
                stroke={line}
                strokeWidth={0.05}
              />
            );
          })}
        </g>
      );
    }
    case "hurdle_mini":
    case "hurdle_low":
    case "hurdle_high": {
      const bar = kind === "hurdle_high" ? 0.11 : kind === "hurdle_low" ? 0.08 : 0.055;
      return (
        <g>
          <rect x={n(-hw)} y={n(-hh)} width={0.1} height={n(h)} fill={line} />
          <rect x={n(hw - 0.1)} y={n(-hh)} width={0.1} height={n(h)} fill={line} />
          <line x1={n(-hw)} y1={0} x2={n(hw)} y2={0} stroke={fill ?? line} strokeWidth={bar} />
        </g>
      );
    }
    case "pole":
      return (
        <g>
          <circle r={n(hw)} fill={body} stroke={line} strokeWidth={sw} />
          <circle r={n(hw * 0.4)} fill={line} />
        </g>
      );
    case "mannequin":
      return (
        <g>
          <ellipse
            cx={0}
            cy={n(hh * 0.25)}
            rx={n(hw)}
            ry={n(hh * 0.55)}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          <circle
            cx={0}
            cy={n(-hh * 0.3)}
            r={n(hh * 0.38)}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
        </g>
      );
    case "dummy":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            rx={0.16}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          <circle cx={0} cy={0} r={n(hh * 0.45)} fill="none" stroke={line} strokeWidth={0.05} />
        </g>
      );
    case "hoop":
    case "hoop_portable": {
      const backboardY = -hh;
      const rimY = backboardY + 0.55;
      return (
        <g>
          {kind === "hoop_portable" ? (
            <rect
              x={n(-hw * 0.35)}
              y={n(backboardY + 0.2)}
              width={n(w * 0.7)}
              height={n(h - 0.35)}
              rx={0.1}
              fill={body}
              stroke={line}
              strokeWidth={0.05}
              strokeDasharray="0.2 0.14"
            />
          ) : null}
          <line
            x1={n(-hw)}
            y1={n(backboardY)}
            x2={n(hw)}
            y2={n(backboardY)}
            stroke={line}
            strokeWidth={0.12}
            strokeLinecap="round"
          />
          <line
            x1={0}
            y1={n(backboardY)}
            x2={0}
            y2={n(rimY - 0.225)}
            stroke={line}
            strokeWidth={0.05}
          />
          <circle
            cx={0}
            cy={n(rimY)}
            r={0.225}
            fill="none"
            stroke={fill ?? line}
            strokeWidth={0.07}
          />
        </g>
      );
    }
    case "rebounder":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            rx={0.06}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          {[-0.4, 0, 0.4].map((k) => (
            <line
              key={k}
              x1={n(k * hw - hh * 0.6)}
              y1={n(hh)}
              x2={n(k * hw + hh * 0.6)}
              y2={n(-hh)}
              stroke={line}
              strokeWidth={0.04}
            />
          ))}
        </g>
      );
    case "passing_net":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            fill={body}
            stroke={line}
            strokeWidth={sw}
            strokeDasharray="0.16 0.1"
          />
          {[-0.5, 0, 0.5].map((k) => (
            <line
              key={k}
              x1={n(k * hw)}
              y1={n(-hh)}
              x2={n(k * hw)}
              y2={n(hh)}
              stroke={line}
              strokeWidth={0.035}
            />
          ))}
        </g>
      );
    case "shooting_machine":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            rx={0.14}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          <path
            d={`M 0 ${n(-hh * 0.6)} L ${n(hw * 0.4)} ${n(hh * 0.1)} L ${n(-hw * 0.4)} ${n(hh * 0.1)} Z`}
            fill={line}
          />
          <circle cx={0} cy={n(hh * 0.5)} r={0.13} fill="none" stroke={line} strokeWidth={0.05} />
        </g>
      );
    case "chair":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            rx={0.06}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          <line
            x1={n(-hw)}
            y1={n(-hh + 0.08)}
            x2={n(hw)}
            y2={n(-hh + 0.08)}
            stroke={line}
            strokeWidth={0.1}
          />
        </g>
      );
    case "bench":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            rx={0.05}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          <line
            x1={n(-hw * 0.5)}
            y1={n(-hh)}
            x2={n(-hw * 0.5)}
            y2={n(hh)}
            stroke={line}
            strokeWidth={0.04}
          />
          <line
            x1={n(hw * 0.5)}
            y1={n(-hh)}
            x2={n(hw * 0.5)}
            y2={n(hh)}
            stroke={line}
            strokeWidth={0.04}
          />
        </g>
      );
    case "band":
      return (
        <rect
          x={n(-hw)}
          y={n(-hh)}
          width={n(w)}
          height={n(h)}
          rx={n(hh)}
          fill={fill ?? line}
          opacity={0.9}
        />
      );
    case "medicine_ball":
      return (
        <g>
          <circle r={n(hw)} fill={body} stroke={line} strokeWidth={0.08} />
          <path
            d={`M ${n(-hw)} 0 H ${n(hw)} M 0 ${n(-hw)} V ${n(hw)}`}
            stroke={line}
            strokeWidth={0.04}
          />
        </g>
      );
    case "tennis_ball":
      return (
        <g>
          <circle r={n(hw)} fill={fill ?? "#d4e157"} stroke={line} strokeWidth={0.03} />
          <path
            d={`M ${n(-hw * 0.7)} ${n(-hw * 0.4)} Q 0 0 ${n(-hw * 0.7)} ${n(hw * 0.4)}`}
            fill="none"
            stroke={line}
            strokeWidth={0.02}
          />
        </g>
      );
    case "mat":
      return (
        <g>
          <rect
            x={n(-hw)}
            y={n(-hh)}
            width={n(w)}
            height={n(h)}
            rx={0.08}
            fill={body}
            stroke={line}
            strokeWidth={sw}
          />
          <line
            x1={0}
            y1={n(-hh)}
            x2={0}
            y2={n(hh)}
            stroke={line}
            strokeWidth={0.03}
            strokeDasharray="0.12 0.1"
          />
        </g>
      );
    case "timer":
      return (
        <g>
          <circle r={n(hw)} fill={body} stroke={line} strokeWidth={sw} />
          <path
            d={`M 0 0 V ${n(-hw * 0.65)} M 0 0 L ${n(hw * 0.45)} ${n(hw * 0.2)}`}
            stroke={line}
            strokeWidth={0.05}
            strokeLinecap="round"
          />
        </g>
      );
  }
}
