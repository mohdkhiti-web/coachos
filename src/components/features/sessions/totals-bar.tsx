"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useFlash } from "@/components/motion";
import { RollingNumber } from "@/components/ui/rolling-number";
import { Tally, type TallySegment } from "@/components/ui/tally";
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
  segments = [],
  className,
}: {
  /** The activities in timeline order, for the running tally (phase colours). */
  segments?: readonly TallySegment[];
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
  const endFlash = useFlash(endTime);

  return (
    <section
      aria-label={t("label")}
      className={cn(
        "flex flex-wrap items-center gap-x-8 gap-y-2.5 rounded-xl border border-line-strong bg-surface-raised/95 px-4 py-3 shadow-pop backdrop-blur-md",
        className,
      )}
    >
      <p className="flex items-baseline gap-2">
        <span className="eyebrow">{t("total")}</span>
        <RollingNumber
          value={total}
          className="numeral text-4xl leading-none font-bold text-ink"
          data-testid="total-minutes"
        />
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
        <p className="hidden items-center gap-1.5 text-sm text-ink-muted sm:inline-flex">
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
      {/* minutes planned against the target: real numbers, drawn with a compositor-only scale */}
      <div
        role="progressbar"
        aria-label={t("progress")}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(total, target)}
        aria-valuetext={t("progressText", { total, target })}
        className="w-full"
      >
        <Tally segments={segments} target={target} />
      </div>
    </section>
  );
}
