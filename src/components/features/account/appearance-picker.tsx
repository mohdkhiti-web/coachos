"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { applyTheme } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/cn";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Three-way theme choice as a real radio group; applies instantly and persists in the theme cookie. */
export function AppearancePicker({ initial }: { initial: ThemeMode }) {
  const t = useTranslations("theme");
  const [mode, setMode] = React.useState<ThemeMode>(initial);

  return (
    <fieldset>
      <legend className="sr-only">
        {t("system")} / {t("light")} / {t("dark")}
      </legend>
      <div className="grid max-w-md grid-cols-3 gap-3">
        {THEME_MODES.map((value) => {
          const Icon = ICONS[value];
          return (
            <label key={value} className="relative block cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  applyTheme(value);
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex flex-col items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 py-4 text-sm font-medium text-ink transition-colors",
                  "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:ring-1 peer-checked:ring-accent hover:bg-surface-sunken",
                  "peer-focus-visible:outline-focus peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(value)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
