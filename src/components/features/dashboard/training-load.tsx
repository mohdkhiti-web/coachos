"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Table2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { RollingNumber } from "@/components/ui/rolling-number";
import { cn } from "@/lib/cn";
import type { TrainingSummary, WeekLoad } from "@/modules/dashboard";

const CHART_H = 168;
const TOP_CATEGORIES = 6;

/** A round axis maximum: the next multiple of 30 minutes (60 once past two hours) above the data. */
function niceMax(v: number): number {
  const step = v > 240 ? 60 : 30;
  return Math.max(step * 2, Math.ceil(v / step) * step);
}

const PHASE_VAR = (p: string) =>
  p === "unphased" ? "var(--ink-faint)" : `var(--phase-${p.replaceAll("_", "-")})`;

/**
 * Training load: minutes on the calendar per week (six weeks back, this week, next week planned) and where the time
 * went over the last four weeks, against the coach's own priorities. One series per chart — the week is the mark,
 * colour says only "this week" (the coach's orange) vs. history (ink); a planned week is outlined, not filled. The
 * phase split is in the tooltip and the table, where it is labelled, never colour alone.
 */
export function TrainingLoad({
  training,
  sportKey,
}: {
  training: TrainingSummary;
  sportKey: string;
}) {
  const t = useTranslations("dashboard.cc.training");
  const format = useFormatter();
  const [active, setActive] = React.useState<number | null>(null);
  const [view, setView] = React.useState<"chart" | "table">("chart");

  const { weeks, categories, untrained, currentMinutes, recentAverage } = training;
  const empty = training.scheduledSessions === 0;
  const max = niceMax(Math.max(...weeks.map((w) => w.minutes), 1));
  const ticks = [max, max / 2, 0];
  const delta = recentAverage === null ? null : currentMinutes - recentAverage;
  const range = (w: WeekLoad) =>
    format.dateTimeRange(new Date(`${w.start}T12:00:00Z`), new Date(`${w.end}T12:00:00Z`), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const short = (w: WeekLoad) =>
    format.dateTime(new Date(`${w.start}T12:00:00Z`), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  const shown = categories.slice(0, TOP_CATEGORIES);
  const catMax = Math.max(1, ...shown.map((c) => c.minutes));
  const drills = `/sports/${sportKey}/drills`;

  return (
    <section
      aria-labelledby="training-h"
      className="grid overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
    >
      {/* ---- weekly load ---- */}
      <div className="space-y-5 p-5 max-lg:border-b max-lg:border-line sm:p-6 lg:border-r lg:border-line">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="training-h" className="text-xl font-semibold tracking-tight text-ink">
              {t("title")}
            </h2>
            <p className="text-sm text-ink-muted">{t("subtitle")}</p>
          </div>
          {empty ? null : (
            <div
              role="group"
              aria-label={t("viewAs")}
              className="flex rounded-md bg-surface-sunken p-0.5"
            >
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex h-11 press items-center gap-1.5 rounded-[5px] px-2.5 text-sm font-semibold smooth-colors focus-visible:outline-2 sm:h-8 [&_svg]:size-3.5",
                    view === v ? "bg-ink text-surface" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {v === "chart" ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
                  {t(v)}
                </button>
              ))}
            </div>
          )}
        </div>

        {empty ? (
          <div className="flex min-h-48 flex-col items-start justify-center gap-3 rounded-lg border border-dashed border-line-strong p-5">
            <p className="max-w-sm text-base text-ink">{t("empty")}</p>
            <Link
              href={`/sessions/${sportKey}/new`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t("emptyCta")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <>
            {/* the headline: this week, against the recent norm */}
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display numeral text-5xl leading-none text-ink">
                <RollingNumber value={currentMinutes} />
              </span>
              <span className="text-sm text-ink-muted">{t("thisWeek")}</span>
              {delta !== null ? (
                <span className="text-sm font-medium text-ink">
                  {delta === 0
                    ? t("onAverage")
                    : t(delta > 0 ? "aboveAverage" : "belowAverage", {
                        minutes: Math.abs(delta),
                      })}
                </span>
              ) : null}
            </p>

            {view === "chart" ? (
              <div className="relative">
                {/* recessive grid with its scale */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0"
                  style={{ height: CHART_H }}
                >
                  {ticks.map((v, i) => (
                    <div
                      key={v}
                      className="absolute inset-x-0 flex items-center gap-2"
                      style={{ top: (i * CHART_H) / 2 }}
                    >
                      <span className="w-8 -translate-y-1/2 text-right numeral text-[11px] text-ink-faint">
                        {v}
                      </span>
                      <span
                        className={cn(
                          "h-px flex-1 -translate-y-1/2",
                          v === 0 ? "bg-line-strong" : "bg-line",
                        )}
                      />
                    </div>
                  ))}
                </div>
                <ol
                  aria-label={t("chartLabel")}
                  className="relative ml-10 flex items-end gap-[2px]"
                  style={{ height: CHART_H }}
                  onMouseLeave={() => setActive(null)}
                >
                  {weeks.map((w, i) => {
                    const h = (w.minutes / max) * CHART_H;
                    const label = t("barLabel", {
                      range: range(w),
                      minutes: w.minutes,
                      sessions: w.sessions,
                    });
                    return (
                      <li
                        key={w.start}
                        className="group/bar relative flex h-full flex-1 items-end justify-center"
                        onMouseEnter={() => setActive(i)}
                      >
                        <button
                          type="button"
                          aria-label={label}
                          aria-describedby={active === i ? "training-tip" : undefined}
                          onFocus={() => setActive(i)}
                          onBlur={() => setActive(null)}
                          className="absolute inset-0 z-10 rounded-sm focus-visible:outline-2"
                        />
                        {w.minutes > 0 ? (
                          <span
                            aria-hidden
                            className={cn(
                              "block w-full max-w-11 animate-grow-y rounded-t-[4px] transition-[filter] duration-200",
                              w.when === "current" && "bg-accent-bright",
                              w.when === "past" && "bg-ink",
                              w.when === "next" &&
                                "border-2 border-b-0 border-dashed border-ink-muted bg-transparent",
                              active !== null && active !== i && "opacity-45",
                            )}
                            style={{ height: Math.max(h, 3), animationDelay: `${i * 45}ms` }}
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="mb-0 block h-px w-full max-w-11 bg-line-strong"
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
                {/* week labels */}
                <ol aria-hidden className="mt-2 ml-10 flex gap-[2px]">
                  {weeks.map((w) => (
                    <li
                      key={w.start}
                      className={cn(
                        "flex-1 truncate text-center text-[11px]",
                        w.when === "current" ? "font-semibold text-ink" : "text-ink-faint",
                      )}
                    >
                      {w.when === "current" ? t("now") : w.when === "next" ? t("next") : short(w)}
                    </li>
                  ))}
                </ol>

                {active !== null ? (
                  // the same box as the bars (right of the scale), so a percentage lands on a bar
                  <div className="pointer-events-none absolute inset-y-0 right-0 left-10">
                    <WeekTip
                      week={weeks[active]!}
                      index={active}
                      count={weeks.length}
                      range={range(weeks[active]!)}
                    />
                  </div>
                ) : null}

                <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <Key className="bg-ink" label={t("legendPast")} />
                  <Key className="bg-accent-bright" label={t("legendCurrent")} />
                  <Key
                    className="border-2 border-dashed border-ink-muted bg-transparent"
                    label={t("legendNext")}
                  />
                </p>
              </div>
            ) : (
              <WeekTable weeks={weeks} range={range} />
            )}
          </>
        )}
      </div>

      {/* ---- coverage ---- */}
      <div className="space-y-5 p-5 sm:p-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-ink">{t("coverageTitle")}</h3>
          <p className="text-sm text-ink-muted">{t("coverageSubtitle")}</p>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("coverageEmpty")}</p>
        ) : (
          <ul className="space-y-3.5">
            {shown.map((c, i) => (
              <li key={c.key ?? "custom"} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-ink">{c.name ?? t("custom")}</span>
                    {c.priority ? (
                      <span className="shrink-0 rounded-xs border border-line-strong px-1.5 py-px text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                        {t("priority")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 numeral text-ink">
                    {t("minutes", { minutes: c.minutes })}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={cn(
                      "h-full animate-grow-x rounded-full",
                      c.priority ? "bg-accent-bright" : "bg-ink",
                    )}
                    style={{
                      width: `${(c.minutes / catMax) * 100}%`,
                      animationDelay: `${200 + i * 60}ms`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {untrained.length > 0 ? (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">{t("untrainedTitle")}</p>
            <ul className="flex flex-wrap gap-2">
              {untrained.map((c) => (
                <li key={c.key}>
                  <Link
                    href={`${drills}?category=${encodeURIComponent(c.key)}`}
                    className="inline-flex min-h-11 press items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink smooth-colors hover:border-ink-faint hover:bg-surface-sunken sm:min-h-9"
                  >
                    {t("findDrills", { name: c.name })}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("inline-block size-2.5 rounded-[2px]", className)} />
      {label}
    </span>
  );
}

function WeekTip({
  week,
  index,
  count,
  range,
}: {
  week: WeekLoad;
  index: number;
  count: number;
  range: string;
}) {
  const t = useTranslations("dashboard.cc.training");
  // keep the tip inside the chart: anchor left half to the bar's left, right half to its right
  const left = index < count / 2;
  const pct = ((index + (left ? 0 : 1)) / count) * 100;
  return (
    <div
      id="training-tip"
      role="tooltip"
      className="pointer-events-none absolute top-0 z-20 w-56 animate-fade-in rounded-lg border border-line bg-surface-raised p-3 text-sm shadow-[0_8px_24px_rgb(15_27_51/0.16)]"
      style={left ? { left: `${pct}%` } : { right: `${100 - pct}%` }}
    >
      <p className="font-semibold text-ink">{range}</p>
      <p className="mt-0.5 text-ink-muted">
        {t("tipSummary", { minutes: week.minutes, sessions: week.sessions })}
      </p>
      {week.phases.length ? (
        <ul className="mt-2 space-y-1">
          {week.phases.map((p) => (
            <li key={p.phase} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink">
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-[2px]"
                  style={{ background: PHASE_VAR(p.phase) }}
                />
                {t(`phases.${p.phase}`)}
              </span>
              <span className="numeral text-ink-muted">{t("minutes", { minutes: p.minutes })}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WeekTable({ weeks, range }: { weeks: WeekLoad[]; range: (w: WeekLoad) => string }) {
  const t = useTranslations("dashboard.cc.training");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("chartLabel")}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("colWeek")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("colSessions")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("colMinutes")}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t("colPhases")}
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                {range(w)}
                {w.when !== "past" ? (
                  <span className="ml-1.5 text-xs font-normal text-ink-muted">
                    ({w.when === "current" ? t("now") : t("next")})
                  </span>
                ) : null}
              </th>
              <td className="py-2 pr-3 text-right numeral text-ink">{w.sessions}</td>
              <td className="py-2 pr-3 text-right numeral text-ink">{w.minutes}</td>
              <td className="py-2 text-ink-muted">
                {w.phases.map((p) => `${t(`phases.${p.phase}`)} ${p.minutes}`).join(" · ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
