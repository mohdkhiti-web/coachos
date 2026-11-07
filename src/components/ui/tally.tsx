"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type TallySegment = {
  id: string;
  minutes: number;
  /** A drill phase key (`warm_up`, `small_sided`…) or `break`; null reads as a plain, un-phased block. */
  phase: string | null;
};

/** `warm_up` → `var(--phase-warm-up)`: the phase colours live in globals.css. */
function phaseColor(phase: string | null): string {
  return phase ? `var(--phase-${phase.replaceAll("_", "-")})` : "var(--ink-faint)";
}

/**
 * The running tally: CoachOS's signature. A scoresheet's running-score columns, translated into a session's
 * minutes. A ruled strip (one column per 5 minutes) fills block by block in phase colours. A block that is added
 * while the coach watches is "struck" in: its fill wipes in from the left and a short orange stroke crosses it,
 * once. Blocks already there on first render are simply drawn.
 *
 * Purely visual (`aria-hidden`): the caller owns the accessible reading (a progressbar, a sentence).
 */
export function Tally({
  segments,
  target = 0,
  size = "md",
  className,
}: {
  segments: readonly TallySegment[];
  /** The planned length. A marker is drawn where it falls when the total runs past it. */
  target?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  // The ids present on first render are not animated; anything that arrives later is. Lazy state, never updated.
  const [initialIds] = React.useState(() => new Set(segments.map((s) => s.id)));
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.minutes), 0);
  const scale = Math.max(total, target, 1);
  const cell = (5 / scale) * 100;

  return (
    <div
      aria-hidden
      className={cn(
        "relative w-full overflow-hidden border border-line bg-surface-sunken",
        size === "md" ? "h-7 rounded-[5px]" : "h-2.5 rounded-[3px]",
        className,
      )}
    >
      <div className="absolute inset-0 flex">
        {segments.map((s, i) => {
          if (s.minutes <= 0) return null;
          const fresh = !initialIds.has(s.id);
          return (
            <span
              key={s.id}
              className={cn(
                "relative h-full shrink-0",
                i > 0 && "border-l border-surface-raised",
                fresh && "tally-fill",
              )}
              style={{ width: `${(s.minutes / scale) * 100}%`, background: phaseColor(s.phase) }}
            >
              {fresh && size === "md" ? (
                <span className="absolute inset-x-1 top-1/2 h-[2px] tally-strike -translate-y-1/2 rounded-full bg-accent-bright" />
              ) : null}
            </span>
          );
        })}
      </div>
      {/* the ruled columns: one hairline every 5 minutes, over the fills like a printed grid */}
      {size === "md" && cell < 50 ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(to right, transparent calc(100% - 1px), var(--surface-raised) 0)",
            backgroundSize: `${cell}% 100%`,
          }}
        />
      ) : null}
      {target > 0 && total > target ? (
        <span
          className="absolute inset-y-0 w-0.5 bg-ink"
          style={{ left: `calc(${(target / scale) * 100}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}
