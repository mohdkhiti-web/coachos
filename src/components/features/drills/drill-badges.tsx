import { cn } from "@/lib/cn";
import type { Intensity, Level } from "@/db/enums";
import type { DrillScope } from "@/modules/drills/dto";

const PIPS: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Three pips like a scoreboard meter, plus the word — never colour or shape alone. */
export function LevelMeter({
  level,
  label,
  className,
}: {
  level: Level;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium text-ink", className)}>
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-1.5 rounded-[1px]",
              i <= PIPS[level] ? "bg-accent" : "bg-line-strong",
            )}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

const SCOPE_STYLE: Record<DrillScope, string> = {
  library: "border-accent text-accent-strong bg-accent-soft",
  mine: "border-line-strong text-ink bg-surface-sunken",
  workspace: "border-line-strong text-ink-muted bg-surface-raised",
};

/** Where a drill comes from: CoachOS library · my private drill · shared in my workspace. */
export function ScopeBadge({ scope, label }: { scope: DrillScope; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 eyebrow text-[0.7rem] tracking-[0.1em] whitespace-nowrap",
        SCOPE_STYLE[scope],
      )}
    >
      {label}
    </span>
  );
}

export const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/** One scoreboard cell: big condensed number, tiny label. Must sit in a `<dl>`; the label (`dt`) comes first in the DOM, the number shows above it. */
export function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col-reverse", className)}>
      <dt className="mt-1 truncate text-xs text-ink-muted">{label}</dt>
      <dd className="numeral text-2xl leading-none font-semibold whitespace-nowrap text-ink">
        {value}
      </dd>
    </div>
  );
}

const INTENSITY_PIPS: Record<Intensity, number> = { low: 1, medium: 2, high: 3 };

/** How hard the drill is: three flame-coloured pips plus the word — never colour alone. */
export function IntensityMeter({
  intensity,
  label,
  className,
}: {
  intensity: Intensity;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium text-ink", className)}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1.5 rounded-[1px]",
              i === 1 ? "h-2" : i === 2 ? "h-2.5" : "h-3",
              i <= INTENSITY_PIPS[intensity] ? "bg-warning" : "bg-line-strong",
            )}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

/** "3v3", "Individual", "Team" — how many-on-how-many. */
export function FormatPill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs border border-line-strong bg-surface px-2 py-0.5 numeral text-sm font-semibold text-ink",
        className,
      )}
    >
      {label}
    </span>
  );
}
