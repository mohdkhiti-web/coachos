"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { THEME_COOKIE, THEME_MODES, type ThemeMode } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Applies a theme immediately and persists it in a cookie the server reads (no flash on reload). */
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeToggle({ initial }: { initial: ThemeMode }) {
  const t = useTranslations("theme");
  const [mode, setMode] = React.useState<ThemeMode>(initial);
  const Icon = ICONS[mode];
  const label = t("toggle", { mode: t(mode) });

  function cycle() {
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length] ?? "system";
    setMode(next);
    applyTheme(next);
  }

  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon" onClick={cycle} aria-label={label}>
        <Icon className="size-5" aria-hidden />
      </Button>
    </Tooltip>
  );
}
