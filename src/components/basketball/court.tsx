import { cn } from "@/lib/cn";

/**
 * A half court drawn to real proportions (10 units = 1 ft: 50 ft wide, 47 ft deep): baseline at the top, the basket
 * 5.25 ft off it. It is the drawing behind the landing hero, the sign-in panel, the onboarding finale and the loading
 * screen — one geometry, so they all read as the same court.
 *
 * Every line carries pathLength="1" so the `court-draw` utility can draw them in with plain CSS. Decorative: hidden from
 * assistive tech (whatever it illustrates is always also said in words).
 */

export const COURT_W = 500;
export const COURT_H = 470;
/** The rim's centre — where shots end. */
export const RIM = { x: 250, y: 52.5 } as const;

export function CourtLines() {
  return (
    <>
      {/* baseline and sidelines */}
      <path pathLength={1} d="M0 0H500V470H0Z" />
      {/* the paint (16 ft wide, 19 ft deep) */}
      <path pathLength={1} d="M170 0V190H330V0" />
      {/* free-throw circle: the half outside the lane is solid, the half inside is dashed */}
      <path pathLength={1} d="M190 190A60 60 0 0 0 310 190" />
      <path pathLength={1} d="M190 190A60 60 0 0 1 310 190" strokeDasharray="0.02 0.03" />
      {/* backboard, rim, restricted-area arc */}
      <path pathLength={1} d="M220 40H280" />
      <circle pathLength={1} cx={RIM.x} cy={RIM.y} r="7.5" />
      <path pathLength={1} d="M210 52.5A40 40 0 0 0 290 52.5" />
      {/* the three-point line: corners 3 ft off each sideline, arc 23.75 ft from the rim */}
      <path pathLength={1} d="M30 0V142A237.5 237.5 0 0 0 470 142V0" />
      {/* centre circle at the half-court line */}
      <path pathLength={1} d="M190 470A60 60 0 0 1 310 470" />
    </>
  );
}

export function HalfCourt({
  className,
  animated = false,
  strokeWidth = 2,
}: {
  className?: string;
  /** Draw the lines in (CSS only; finished at once under reduced motion and in print). */
  animated?: boolean;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox={`-4 -4 ${COURT_W + 8} ${COURT_H + 8}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn(animated && "court-draw", className)}
    >
      <CourtLines />
    </svg>
  );
}

/** A full-bleed court behind a section: faint, oversized, cropped by its container. */
export function BasketballCourtBackground({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <HalfCourt
        animated={animated}
        className="absolute -top-[6%] -right-[18%] h-[112%] w-auto text-ink/[0.09] sm:-right-[8%]"
        strokeWidth={1.6}
      />
    </div>
  );
}
