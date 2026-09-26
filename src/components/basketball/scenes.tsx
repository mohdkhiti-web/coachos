import { cn } from "@/lib/cn";
import { CourtLines } from "./court";
import { PlayerFigure } from "./figures";

/**
 * Small illustrated scenes for cards, empty states and side panels — original vector art built from the same court and
 * figure drawings as the hero. They are what the imagery config (src/components/basketball/imagery.ts) falls back to when a slot has no
 * photograph, so a real photo can replace any of them without touching the pages that use them.
 */

export type SceneKey = "planning" | "shooting" | "defense" | "huddle";

const ACCENT = "var(--accent)";

function Planning() {
  return (
    <>
      {/* the tactics board */}
      <rect
        x="112"
        y="14"
        width="200"
        height="158"
        rx="12"
        fill="var(--surface-raised)"
        stroke="var(--line-strong)"
        strokeWidth="2"
      />
      <svg
        x="122"
        y="22"
        width="180"
        height="142"
        viewBox="-4 -4 508 478"
        className="text-line-strong"
        strokeWidth="5"
        fill="none"
      >
        <CourtLines />
      </svg>
      {/* a play on the board: offence as filled circles, a defender as a square, a cut and a pass */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <circle cx="206" cy="112" r="8" fill={ACCENT} stroke="none" />
        <circle cx="262" cy="100" r="8" fill={ACCENT} stroke="none" />
        <circle cx="168" cy="78" r="8" fill={ACCENT} stroke="none" />
        <rect
          x="192"
          y="82"
          width="14"
          height="14"
          rx="2"
          fill="none"
          stroke="var(--ink-muted)"
          strokeWidth="2.4"
        />
        <path d="M262 100C250 76 236 58 218 44" stroke={ACCENT} strokeWidth="2.6" />
        <path d="M212 44L221 41L219 51" stroke={ACCENT} strokeWidth="2.6" fill="none" />
        <path
          d="M176 82C186 92 196 100 200 106"
          stroke={ACCENT}
          strokeWidth="2.4"
          strokeDasharray="5 5"
        />
      </g>
      <svg x="6" y="30" width="96" height="152" viewBox="0 0 120 190" className="text-ink">
        <PlayerFigure pose="coach" />
      </svg>
      <path d="M8 192H312" stroke="var(--line-strong)" strokeWidth="2" />
    </>
  );
}

function Shooting() {
  return (
    <>
      {/* backboard, rim and net */}
      <path d="M270 30V96" stroke="var(--ink-muted)" strokeWidth="5" />
      <path d="M270 62H236" stroke={ACCENT} strokeWidth="4" />
      <path
        d="M236 62l6 26h20l6-26M246 62l3 26M256 62l-2 26"
        stroke="var(--ink-muted)"
        strokeWidth="1.6"
      />
      {/* the shot */}
      <path d="M96 118Q112 -20 232 56" stroke={ACCENT} strokeWidth="2.2" strokeDasharray="3 8" />
      <circle cx="238" cy="60" r="8" fill={ACCENT} stroke="none" />
      <svg x="34" y="52" width="86" height="136" viewBox="0 0 120 190" className="text-ink">
        <PlayerFigure pose="shooter" ball={false} />
      </svg>
      <path d="M8 192H312" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M120 192H198" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Defense() {
  return (
    <>
      <svg x="40" y="44" width="92" height="148" viewBox="0 0 120 190" className="text-ink">
        <PlayerFigure pose="dribbler" />
      </svg>
      <svg x="150" y="48" width="86" height="140" viewBox="0 0 120 190" className="text-ink-muted">
        <PlayerFigure pose="defender" />
      </svg>
      <path d="M150 204H98" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      <path
        d="M106 198L98 204L106 210"
        stroke={ACCENT}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M8 192H312" stroke="var(--line-strong)" strokeWidth="2" />
    </>
  );
}

function Huddle() {
  const dots = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    return { x: 160 + Math.cos(a) * 66, y: 100 + Math.sin(a) * 66 };
  });
  return (
    <>
      <circle cx="160" cy="100" r="86" stroke="var(--line-strong)" strokeWidth="2" />
      <circle
        cx="160"
        cy="100"
        r="30"
        stroke="var(--line-strong)"
        strokeWidth="2"
        strokeDasharray="4 6"
      />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="11" fill="var(--ink)" stroke="none" opacity={0.78} />
      ))}
      <circle cx="160" cy="100" r="11" fill={ACCENT} stroke="none" />
    </>
  );
}

const SCENES: Record<SceneKey, () => React.ReactElement> = {
  planning: Planning,
  shooting: Shooting,
  defense: Defense,
  huddle: Huddle,
};

export function CoachScene({ scene, className }: { scene: SceneKey; className?: string }) {
  const Scene = SCENES[scene];
  return (
    <svg
      viewBox="0 0 320 220"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <Scene />
    </svg>
  );
}
