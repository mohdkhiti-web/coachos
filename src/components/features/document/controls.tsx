"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { contrastRatio, normalizeHex } from "@/modules/documents";

/**
 * Small, native-input-based controls for the design panel. Radio inputs give arrow-key navigation, a name and
 * a checked state for free; nothing here is a custom widget that would need its own keyboard model.
 */

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

const focusRing =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus";

export function Segmented<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  legend: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const name = React.useId();
  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <div className="inline-flex max-w-full flex-wrap overflow-hidden rounded-md border border-line-strong">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={cn(
                "relative flex min-h-10 cursor-pointer items-center px-3.5 text-sm font-medium select-none",
                focusRing,
                checked
                  ? "bg-accent text-accent-ink"
                  : "bg-surface-raised text-ink hover:bg-surface-sunken",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={String(o.value)}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A HEX field paired with the native colour picker. Typing only takes effect once the text is a real colour. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const t = useTranslations("sessions.design");
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && normalizeHex(draft) === null;
  const errorId = React.useId();

  return (
    <div className="min-w-0">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t("colors.pick", { name: label })}
          value={value}
          onChange={(e) => {
            setDraft(null);
            onChange(e.target.value);
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface-raised p-1"
        />
        <input
          type="text"
          aria-label={t("colors.hex", { name: label })}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          value={shown}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            const hex = normalizeHex(text);
            if (hex) onChange(hex);
          }}
          onBlur={() => setDraft(null)}
          className="focus-visible:outline-focus h-10 w-full min-w-0 rounded-md border border-line-strong bg-surface-raised px-2.5 font-mono text-sm text-ink uppercase focus-visible:border-accent focus-visible:outline-2 aria-[invalid=true]:border-danger"
        />
      </div>
      {invalid ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {t("colors.invalid")}
        </p>
      ) : null}
    </div>
  );
}

/** How readable is this pairing? The verdicts follow WCAG: 4.5:1 for text, 3:1 for shapes and rules. */
export function ContrastRow({
  label,
  foreground,
  background,
  goodAt,
  badBelow,
  note,
}: {
  label: string;
  foreground: string;
  background: string;
  goodAt: number;
  /** Below this the pairing is refused (only the body text has one). */
  badBelow?: number;
  note?: string;
}) {
  const t = useTranslations("sessions.design");
  const ratio = contrastRatio(foreground, background);
  const verdict =
    ratio >= goodAt ? "good" : badBelow !== undefined && ratio < badBelow ? "bad" : "low";
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
      data-verdict={verdict}
    >
      <span className="text-ink">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="numeral text-ink-muted">{ratio.toFixed(1)}:1</span>
        <span
          className={cn(
            // ink on a soft tint, with a coloured edge: the colour says it, the word says it too, and both are readable
            "rounded-full border px-2 py-0.5 text-xs font-medium text-ink",
            verdict === "good" && "border-success bg-success-soft",
            verdict === "low" && "border-warning bg-warning-soft",
            verdict === "bad" && "border-danger bg-danger-soft",
          )}
        >
          {t(`contrast.${verdict}`)}
        </span>
      </span>
      {verdict !== "good" && note ? (
        <span className="basis-full text-xs text-ink-muted">{note}</span>
      ) : null}
    </li>
  );
}
