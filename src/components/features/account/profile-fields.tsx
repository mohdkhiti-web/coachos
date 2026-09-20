"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { PROFESSIONS, type Profession } from "@/db/enums";
import { cn } from "@/lib/cn";

const noopSubscribe = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "";

type Props = {
  defaults: { name: string; profession: Profession | null; timezone: string | null };
  /** Server-rendered IANA list (avoids server/browser ICU differences causing hydration mismatches). */
  timezones: string[];
  errors: (field: string) => string[] | undefined;
  /** Use the browser's timezone when the user has none saved yet. */
  detectTimezone?: boolean;
  nameHint?: string;
};

export function ProfileFields({ defaults, timezones, errors, detectTimezone, nameHint }: Props) {
  const t = useTranslations("onboarding");
  // `chosen` is null until the user touches the select; the shown value is derived, not synced.
  const [chosen, setChosen] = React.useState<string | null>(null);
  const detected = React.useSyncExternalStore(noopSubscribe, browserTimezone, serverTimezone);
  const suggestion = detectTimezone && detected && timezones.includes(detected) ? detected : "";
  const timezone = chosen ?? defaults.timezone ?? suggestion;

  const professionErrors = errors("profession");

  return (
    <div className="space-y-6">
      <Field label={t("name")} hint={nameHint} errors={errors("name")}>
        {(c) => (
          <Input {...c} name="name" defaultValue={defaults.name} autoComplete="name" required />
        )}
      </Field>

      <fieldset
        className="space-y-2"
        aria-describedby={professionErrors ? "profession-error" : undefined}
      >
        <legend className="mb-1.5 text-sm font-medium text-ink">{t("profession")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {PROFESSIONS.map((value) => (
            <label key={value} className="relative block cursor-pointer">
              <input
                type="radio"
                name="profession"
                value={value}
                defaultChecked={defaults.profession === value}
                required
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-full flex-col gap-1 rounded-md border border-line-strong bg-surface-raised p-3.5 transition-colors",
                  "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:ring-1 peer-checked:ring-accent hover:bg-surface-sunken",
                  "peer-focus-visible:outline-focus peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                )}
              >
                <span className="text-sm font-semibold text-ink">{t(`professions.${value}`)}</span>
                <span className="text-xs leading-snug text-ink-muted">
                  {t(`professions.${value}Hint`)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {professionErrors ? (
          <p id="profession-error" role="alert" className="text-sm font-medium text-danger">
            {professionErrors.join(" ")}
          </p>
        ) : null}
      </fieldset>

      <Field label={t("timezone")} hint={t("timezoneHint")} errors={errors("timezone")}>
        {(c) => (
          <Select
            {...c}
            name="timezone"
            value={timezone}
            onChange={(e) => setChosen(e.target.value)}
            required
          >
            <option value="" disabled>
              —
            </option>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}
