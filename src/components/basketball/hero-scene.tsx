import { cn } from "@/lib/cn";
import { CourtLines, RIM } from "./court";
import { PlayerFigure, type Pose } from "./figures";

/**
 * The landing hero: a half court draws itself, players and a coach take their spots, a cut and a pass are drawn up, and
 * one shot travels from the top of the key into the rim. It plays once (about 3 seconds), then rests — a professional
 * coaching product, not a game. CSS draws the lines; the ball's flight is SVG-native (`animateMotion`), and a static
 * twin (ball already at the rim) is what reduced-motion users and print get.
 *
 * The scene is decorative (aria-hidden): the page's words say everything it shows.
 */

/** Where each figure stands, in court units (the figure box is 120 × 190, scaled by `w / 120`). */
const CAST: Array<{ pose: Pose; x: number; y: number; w: number; tone: string; ball?: boolean }> = [
  { pose: "shooter", x: 112, y: 178, w: 82, tone: "text-ink", ball: false },
  { pose: "defender", x: 188, y: 196, w: 70, tone: "text-ink-muted" },
  { pose: "dribbler", x: 372, y: 236, w: 76, tone: "text-ink" },
  { pose: "passer", x: 40, y: 318, w: 72, tone: "text-ink" },
  { pose: "coach", x: 392, y: 352, w: 84, tone: "text-ink-muted" },
];

/** The shot: from the shooter's hands to the rim. The dashed trajectory and the ball share this one path. */
const SHOT = "M171 186Q196 -74 250 52";

const delay = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as React.CSSProperties;

export function BasketballHeroScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-24 -84 548 588"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("h-full w-full", className)}
    >
      <defs>
        <marker
          id="hero-arrow"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M1 1L8 5L1 9" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
        </marker>
      </defs>

      {/* the court, drawn line by line */}
      <g className="court-draw text-ink/30" strokeWidth="2.2">
        <CourtLines />
      </g>

      {/* a cut to the basket and a pass across, drawn up after the court */}
      <g strokeWidth="3" stroke="var(--accent)" className="rise" style={delay(900)}>
        <path d="M384 246C352 190 314 130 266 78" markerEnd="url(#hero-arrow)" />
        <path
          d="M108 340C112 300 122 262 146 232"
          strokeDasharray="7 7"
          markerEnd="url(#hero-arrow)"
        />
      </g>

      {/* the players, one after another */}
      {CAST.map((p, i) => (
        <svg
          key={p.pose}
          x={p.x}
          y={p.y}
          width={p.w}
          height={(p.w * 190) / 120}
          viewBox="0 0 120 190"
          className={cn("rise overflow-visible", p.tone)}
          style={delay(500 + i * 130)}
        >
          <PlayerFigure pose={p.pose} ball={p.ball ?? true} />
        </svg>
      ))}

      {/* the shot's flight, faintly traced */}
      <path d={SHOT} stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 9" opacity="0.55" />

      {/* the ball: flies once (motion allowed) … */}
      <g className="motion-safe-only">
        <g>
          <circle r="10" fill="var(--accent)" stroke="none" />
          <path
            d="M-10 0H10M0 -10V10"
            stroke="var(--accent-ink)"
            strokeWidth="1.5"
            opacity="0.85"
          />
          <animateMotion
            dur="2.6s"
            begin="0s"
            fill="freeze"
            path={SHOT}
            calcMode="spline"
            keyPoints="0;0;1"
            keyTimes="0;0.45;1"
            keySplines="0 0 1 1;0.25 0.1 0.55 1"
          />
        </g>
      </g>
      {/* … or is simply already through the hoop (reduced motion, print) */}
      <g className="motion-reduce-only" transform={`translate(${RIM.x} ${RIM.y})`}>
        <circle r="10" fill="var(--accent)" stroke="none" />
        <path d="M-10 0H10M0 -10V10" stroke="var(--accent-ink)" strokeWidth="1.5" opacity="0.85" />
      </g>
    </svg>
  );
}
