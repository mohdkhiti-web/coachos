"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

const TICK_MS = 15_000;

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(id);
}
// Snapshot changes once per tick; `null` on the server (and during hydration) so markup matches.
const getSnapshot = () => Math.floor(Date.now() / TICK_MS);
const getServerSnapshot = () => null;

/** A real clock in the user's own timezone, in scoreboard numerals. */
export function LocalClock({ timezone }: { timezone: string }) {
  const t = useTranslations("dashboard.clock");
  const tick = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = tick === null ? null : new Date(tick * TICK_MS);

  const time = now
    ? new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }).format(now)
    : "--:--";
  const day = now
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: timezone,
      }).format(now)
    : "";

  return (
    <div className="text-left sm:text-right">
      <p className="eyebrow">{t("label")}</p>
      <p className="numeral text-5xl leading-none font-semibold text-ink">{time}</p>
      <p className="mt-1.5 text-sm text-ink-muted">
        {day}
        {day ? " · " : ""}
        {t("zone", { zone: timezone.replaceAll("_", " ") })}
      </p>
    </div>
  );
}
