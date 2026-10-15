import { cn } from "@/lib/cn";

/**
 * Stylised players and a coach, drawn as bold rounded strokes — the same visual grammar as CoachOS's play diagrams
 * (paths, arrows, markers), so the artwork and the product speak one language. Original vector art: no photograph,
 * no stock asset, nothing to license. They take `currentColor`, so a scene tints them with a text-* class.
 *
 * Each pose is drawn in a 120 × 190 box; `PlayerFigure` scales it.
 */

export type Pose = "shooter" | "dribbler" | "defender" | "coach" | "passer";

const LIMB = 13;
const TORSO = 24;

function Ball({ cx, cy, r = 11 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--accent)" stroke="none" />
      <path
        d={`M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}`}
        stroke="var(--accent-ink)"
        strokeWidth="1.6"
        opacity="0.85"
      />
    </g>
  );
}

function Head({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r="14.5" fill="currentColor" stroke="none" />;
}

function Body({ pose, ball }: { pose: Pose; ball: boolean }) {
  switch (pose) {
    case "shooter":
      return (
        <>
          <Head cx={58} cy={44} />
          <path strokeWidth={TORSO} d="M58 64V122" />
          <path strokeWidth={LIMB} d="M58 76L80 62L84 40M58 76L70 56L76 36" />
          <path strokeWidth={LIMB} d="M58 122L72 150L68 184M58 122L44 152L34 184" />
          {ball ? <Ball cx={82} cy={26} /> : null}
        </>
      );
    case "dribbler":
      return (
        <>
          <Head cx={78} cy={46} />
          <path strokeWidth={TORSO} d="M72 66L56 122" />
          <path strokeWidth={LIMB} d="M70 78L88 100L100 138M68 78L46 96L34 112" />
          <path strokeWidth={LIMB} d="M56 122L78 150L90 184M56 122L38 152L26 184" />
          {ball ? <Ball cx={102} cy={152} /> : null}
        </>
      );
    case "defender":
      return (
        <>
          <Head cx={60} cy={54} />
          <path strokeWidth={TORSO} d="M60 74V124" />
          <path strokeWidth={LIMB} d="M60 82L30 92L12 70M60 82L90 92L108 70" />
          <path strokeWidth={LIMB} d="M60 124L34 150L22 184M60 124L86 150L98 184" />
        </>
      );
    case "passer":
      return (
        <>
          <Head cx={54} cy={44} />
          <path strokeWidth={TORSO} d="M56 64L52 122" />
          <path strokeWidth={LIMB} d="M56 76L82 86L104 84M56 76L78 96L98 90" />
          <path strokeWidth={LIMB} d="M52 122L66 152L62 184M52 122L38 152L30 184" />
          {ball ? <Ball cx={108} cy={86} r={10} /> : null}
        </>
      );
    case "coach":
      return (
        <>
          <Head cx={52} cy={36} />
          <path strokeWidth={TORSO} d="M54 56V124" />
          {/* the clipboard */}
          <rect
            x="40"
            y="82"
            width="26"
            height="34"
            rx="3"
            fill="var(--surface-raised)"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path d="M46 94H60M46 102H60M46 110H54" stroke="var(--accent)" strokeWidth="3" />
          <path strokeWidth={LIMB} d="M54 68L40 92L54 104" />
          <path strokeWidth={LIMB} d="M54 68L82 70L106 56" />
          <path strokeWidth={LIMB} d="M54 124L46 184M54 124L66 184" />
        </>
      );
  }
}

export function PlayerFigure({
  pose,
  ball = true,
  className,
}: {
  pose: Pose;
  /** Draw the ball this pose holds (a scene that animates its own ball turns it off). */
  ball?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 190"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <Body pose={pose} ball={ball} />
    </svg>
  );
}

/** A lone basketball (used as an icon and in loading states). */
export function BasketballIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn("size-6", className)}
    >
      <circle cx="16" cy="16" r="14" fill="var(--accent)" />
      <g stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
        <path d="M2 16h28M16 2v28" />
        <path d="M6 5.5c4.5 3.5 4.5 17.5 0 21M26 5.5c-4.5 3.5-4.5 17.5 0 21" />
      </g>
    </svg>
  );
}
