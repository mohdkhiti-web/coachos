"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { PLAN_LIMITS } from "@/db/enums";

export type ObjectiveOption = { key: string; name: string };

/**
 * A coach-friendly objective chooser: ONE main objective from a list ("Shooting", "Transition"…) and, if they
 * like, a few more to work on — shown as toggle chips, so what is selected is always visible, and removing one
 * is the same click that added it. The detailed skills underneath never appear.
 */
export function ObjectivePicker({
  objectives,
  primary,
  secondary,
  onChange,
  errors,
  disabled,
}: {
  objectives: ObjectiveOption[];
  primary: string;
  secondary: string[];
  onChange: (next: { primary: string; secondary: string[] }) => void;
  /** Already translated. */
  errors?: { primary?: string[]; secondary?: string[] };
  disabled?: boolean;
}) {
  const t = useTranslations("sessions.objectives");
  const max = PLAN_LIMITS.maxSecondaryObjectives;
  const options = objectives.filter((o) => o.key !== primary);
  const full = secondary.length >= max;

  return (
    <div className="space-y-5">
      <Field label={t("main")} errors={errors?.primary} hint={t("mainHint")}>
        {(c) => (
          <Select
            {...c}
            name="primaryObjective"
            value={primary}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                primary: e.target.value,
                // the main objective is not also a secondary one
                secondary: secondary.filter((k) => k !== e.target.value),
              })
            }
          >
            <option value="">{t("mainPlaceholder")}</option>
            {objectives.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <fieldset disabled={disabled || !primary} className="min-w-0 space-y-2">
        <legend className="text-sm font-medium text-ink">{t("secondary")}</legend>
        <p className="text-sm text-ink-muted">
          {primary ? t("secondaryHint", { max }) : t("secondaryNeedsMain")}
        </p>
        <ul className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = secondary.includes(o.key);
            return (
              <li key={o.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() =>
                    onChange({
                      primary,
                      secondary: on ? secondary.filter((k) => k !== o.key) : [...secondary, o.key],
                    })
                  }
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50",
                    on
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line-strong bg-surface-raised text-ink-muted hover:border-accent hover:text-ink",
                  )}
                >
                  {on ? <Check className="size-4 text-accent" aria-hidden /> : null}
                  {o.name}
                </button>
              </li>
            );
          })}
        </ul>
        {errors?.secondary?.length ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors.secondary.join(" ")}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
