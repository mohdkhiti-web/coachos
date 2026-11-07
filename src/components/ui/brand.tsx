import { cn } from "@/lib/cn";

/** CoachOS mark: a play-diagram glyph (a path with an arrowhead ending at a marker) in a rounded square. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-accent-bright" />
      <g
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 22c0-6 4-9 9-9h4" />
        <path d="M18 9l4 4-4 4" />
      </g>
      <circle cx="8" cy="22" r="2.4" fill="var(--accent-ink)" />
    </svg>
  );
}

/** "CoachOS" set in the condensed display width; "OS" is the coach's orange mark. `tone="rail"` for the blue band. */
export function Wordmark({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "rail";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span
        className={cn(
          "display text-[1.7rem] leading-none tracking-[0.005em]",
          tone === "rail" ? "text-rail-ink" : "text-ink",
        )}
      >
        Coach<span className={tone === "rail" ? "text-accent-bright" : "text-accent"}>OS</span>
      </span>
    </span>
  );
}
