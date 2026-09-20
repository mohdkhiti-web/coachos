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
      <rect width="32" height="32" rx="8" className="fill-accent" />
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

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="display text-[1.65rem] leading-none tracking-[0.04em] text-ink uppercase">
        Coach<span className="text-accent">OS</span>
      </span>
    </span>
  );
}
