"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * One answer in the onboarding: a real toggle button (`role="radio"` when only one may be chosen, `role="checkbox"` when
 * several may), so it is fully keyboard- and screen-reader-operable. Selecting settles it with one small press-in.
 * `compact` is the chip shape used for the long multi-select lists; the default is the roomy card with a hint.
 */
export function ChoiceCard({
  selected,
  multiple,
  onToggle,
  label,
  hint,
  tag,
  compact = false,
  disabled = false,
}: {
  selected: boolean;
  multiple: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
  /** A small note beside the label (e.g. "Coming soon"). */
  tag?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "group relative flex w-full press items-center gap-3 rounded-xl border text-left smooth-colors focus-visible:outline-2 disabled:opacity-55",
        compact ? "min-h-12 px-4 py-2.5" : "min-h-16 px-5 py-4",
        selected
          ? "selected-pop border-accent bg-accent-soft text-ink"
          : "border-line-strong bg-surface-raised text-ink hover:border-accent/60 hover:bg-surface-sunken",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border smooth-colors",
          multiple ? "rounded-md" : "rounded-full",
          selected
            ? "border-accent bg-accent text-accent-ink"
            : "border-line-strong bg-transparent",
        )}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn("font-semibold tracking-tight", compact ? "text-[0.95rem]" : "text-base")}
          >
            {label}
          </span>
          {tag ? (
            <span className="rounded-full border border-line-strong px-2 py-px text-[0.68rem] font-medium tracking-wide text-ink-muted uppercase">
              {tag}
            </span>
          ) : null}
        </span>
        {hint ? <span className="mt-0.5 block text-sm text-ink-muted">{hint}</span> : null}
      </span>
    </button>
  );
}
