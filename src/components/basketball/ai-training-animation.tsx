import { cn } from "@/lib/cn";
import { CourtLines } from "./court";

/**
 * The picture of the AI Coach working: a half court where a play is being drawn up — dashed movement paths flowing to
 * the basket. It is mounted ONLY while a request is really in flight (the chat's `sending` state, the generator's
 * `pending` state) and disappears the moment the answer arrives, so it never suggests work that is not happening.
 * Decorative: the caller shows the real status text ("Searching the drill library…") beside it.
 */
export function AITrainingAnimation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-4 -4 508 478"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("h-16 w-auto shrink-0", className)}
    >
      <g className="text-ink/35" strokeWidth="6">
        <CourtLines />
      </g>
      <g stroke="var(--accent)" strokeWidth="9" className="play-flow">
        <path d="M120 330C140 250 190 170 246 70" />
        <path d="M400 320C370 240 320 160 262 74" />
        <path d="M250 400C250 330 250 250 250 150" />
      </g>
      <g fill="var(--accent)" stroke="none">
        <circle cx="120" cy="330" r="20" />
        <circle cx="400" cy="320" r="20" />
        <circle cx="250" cy="400" r="20" />
      </g>
    </svg>
  );
}
