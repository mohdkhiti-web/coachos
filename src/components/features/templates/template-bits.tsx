import { cn } from "@/lib/cn";
import type { DocumentDesign } from "@/modules/documents";

/**
 * The look of a template at a glance: its colours as a strip on its own page colour. Purely visual (hidden from
 * assistive tech): the name, preset and page facts beside it say the same things in words.
 */
export function Swatches({ design, className }: { design: DocumentDesign; className?: string }) {
  const { colors } = design;
  return (
    <span
      aria-hidden
      className={cn("flex h-7 overflow-hidden rounded-xs border border-line-strong", className)}
      style={{ background: colors.background }}
    >
      {[colors.primary, colors.secondary, colors.accent, colors.text].map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

/** A small, quiet label. The words carry the meaning; the border is only decoration. */
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-ink",
        tone === "neutral" && "border-line-strong bg-surface",
        tone === "accent" && "border-accent bg-accent-soft",
        tone === "warning" && "border-warning bg-warning-soft",
      )}
    >
      {children}
    </span>
  );
}
