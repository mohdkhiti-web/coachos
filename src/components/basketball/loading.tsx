import { cn } from "@/lib/cn";
import { HalfCourt } from "./court";
import { BasketballIcon } from "./figures";

/**
 * The CoachOS loading screen: a ball dribbling on a court line. It is only ever mounted while something is really
 * loading (a route's loading.tsx, a Suspense fallback) — it adds no delay of its own and stops the moment the content
 * arrives. `role="status"` gives assistive tech the same message the screen shows.
 */
export function BasketballLoading({
  label,
  className,
  compact = false,
}: {
  /** "Preparing your court…" (translated by the caller). */
  label: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex flex-col items-center justify-center gap-5 overflow-hidden text-center",
        compact ? "min-h-40 py-8" : "min-h-[50dvh] py-16",
        className,
      )}
    >
      <HalfCourt
        className="pointer-events-none absolute top-1/2 left-1/2 h-[140%] w-auto -translate-x-1/2 -translate-y-1/2 text-ink/[0.07]"
        strokeWidth={1.4}
      />
      <div className="relative flex h-16 w-24 flex-col items-center justify-end">
        <BasketballIcon className="size-8 dribble" />
        <span aria-hidden className="mt-1 h-0.5 w-20 rounded-full bg-line-strong" />
      </div>
      <p className="relative eyebrow">{label}</p>
    </div>
  );
}
