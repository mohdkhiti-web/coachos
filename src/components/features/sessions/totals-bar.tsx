"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useFlash } from "@/components/motion";
import { cn } from "@/lib/cn";
import { formatClockTime } from "@/modules/plans/format";

/**
 * TOTAL: 90 MINUTES · END: 7:30 PM. Every number here is handed in by the builder from the SAME shared calculation
 * the server and the database use (`summarize` → `@/modules/plans/schedule`); this component only lays them out.
 */
export function TotalsBar({
  total,
  target,
  remaining,
  endTime,
  endsNextDay,
  className,
}: {
  total: number;
  target: number;
  remaining: number;
  /** `HH:MM` in the session's zone, from `computeSchedule`; null until the session has a date and start time. */
  endTime: string | null;
  endsNextDay: boolean;
  className?: string;
}) {
  const t = useTranslations("sessions.builder.totals");
  const locale = useLocale();
  const over = remaining < 0;
  // A brief accent tint on the numbers that actually changed (an activity added/removed/resized) — never on
  // first render, and never a shake or bounce, just a single acknowledgement (motion.css `cos-flash`).
  const totalFlash = useFlash(total);
  const endFlash = useFlash(endTime);

  return (
    <section
      aria-label={t("label")}
      className={cn(
        "flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-line-strong bg-surface-raised px-4 py-3 shadow-paper",
        className,
      )}
    >
      <p className="flex items-baseline gap-2">
        <span className="eyebrow">{t("total")}</span>
        <span
          key={totalFlash.flashKey}
          className={cn(
            "-mx-1 rounded px-1 numeral text-4xl leading-none font-semibold text-ink",
            totalFlash.changed && "animate-flash",
          )}
          data-testid="total-minutes"
        >
          {total}
        </span>
        <span className="text-sm font-medium text-ink-muted uppercase">{t("minutes")}</span>
      </p>

      {endTime ? (
        <p className="flex items-baseline gap-2">
          <span className="eyebrow">{t("end")}</span>
          <span
            key={endFlash.flashKey}
            className={cn(
              "-mx-1 rounded px-1 numeral text-3xl leading-none font-semibold text-ink",
              endFlash.changed && "animate-flash",
            )}
            data-testid="end-time"
          >
            {formatClockTime(endTime, locale)}
          </span>
          {endsNextDay ? <span className="text-sm text-ink-muted">{t("nextDay")}</span> : null}
        </p>
      ) : (
        <p className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
          <Clock className="size-4" aria-hidden />
          {t("noEnd")}
        </p>
      )}

      <p
        className={cn("ml-auto text-sm", over ? "font-semibold text-warning" : "text-ink-muted")}
        data-testid="target-status"
      >
        {remaining === 0
          ? t("onTarget", { target })
          : over
            ? t("over", { target, minutes: -remaining })
            : t("toFill", { target, minutes: remaining })}
      </p>
    </section>
  );
}
