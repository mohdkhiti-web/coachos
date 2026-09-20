import { cn } from "@/lib/cn";

/**
 * Court-line ornament (§2.2): half-court geometry drawn as hairlines. Used sparingly — hero, auth
 * panel, empty states. Decorative, so hidden from assistive tech. Colours come from tokens.
 */
export function CourtMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 300"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
      className={cn("text-line-strong", className)}
    >
      {/* baseline + sidelines */}
      <path d="M10 10h300v280H10z" />
      {/* the key (lane) and free-throw circle */}
      <path d="M110 10v140h100V10" />
      <path d="M110 150a50 50 0 0 0 100 0" />
      <path d="M110 150a50 50 0 0 1 100 0" strokeDasharray="4 6" />
      {/* backboard + rim */}
      <path d="M140 30h40" />
      <circle cx="160" cy="44" r="9" />
      {/* three-point arc with corner lines */}
      <path d="M40 10v58a120 120 0 0 0 240 0V10" />
      {/* centre-court arc */}
      <path d="M100 290a60 60 0 0 1 120 0" />
    </svg>
  );
}
