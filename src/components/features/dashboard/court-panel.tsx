import Link from "next/link";
import { ArrowRight, FileText, Play, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/features/sessions/badges";
import { Button } from "@/components/ui/button";
import { Tally } from "@/components/ui/tally";
import type { FeaturedSession } from "@/modules/dashboard";
import { formatClockTime, formatDateOnly } from "@/modules/plans/format";

const DEFAULT_TARGET = 90;

/**
 * "On court": the session the coach is about to run (or last worked on) with its running tally, the signature of
 * the Scoresheet world. Every minute shown is the session's real activity data. With no session yet, the strip
 * is drawn empty and ruled, waiting for the first practice.
 */
export async function CourtPanel({
  featured,
  sportKey,
}: {
  featured: FeaturedSession | null;
  sportKey: string;
}) {
  const [t, td, ts, tdoc, tr, locale] = await Promise.all([
    getTranslations("dashboard.cc.court"),
    getTranslations("drills"),
    getTranslations("sessions"),
    getTranslations("sessions.document"),
    getTranslations("sessions.run"),
    getLocale(),
  ]);

  if (!featured) {
    return (
      <section
        aria-labelledby="court-h"
        className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="court-h" className="text-base font-semibold text-ink">
            {t("title")}
          </h2>
        </header>
        <div className="flex flex-1 flex-col justify-between gap-6 p-5 md:p-7">
          <div className="space-y-2">
            <p className="display text-4xl text-ink">{t("emptyTitle")}</p>
            <p className="max-w-lg text-ink-muted">{t("emptyBody")}</p>
          </div>
          <Tally segments={[]} target={DEFAULT_TARGET} />
          <div>
            <Button asChild>
              <Link href={`/sessions/${sportKey}/new`}>
                <Plus className="size-4" aria-hidden />
                {ts("new.title")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const { plan, blocks } = featured;
  const total = blocks.reduce((sum, b) => sum + b.minutes, 0);
  const when = plan.scheduledDate
    ? [
        formatDateOnly(plan.scheduledDate, locale, false),
        plan.startTime ? formatClockTime(plan.startTime, locale) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("unscheduled");

  // minutes per phase, in the order phases first appear: the legend is colour AND words, never colour alone
  const byPhase = new Map<string, number>();
  for (const b of blocks) {
    const key = b.phase ?? "none";
    byPhase.set(key, (byPhase.get(key) ?? 0) + b.minutes);
  }

  return (
    <section
      aria-labelledby="court-h"
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="court-h" className="text-base font-semibold text-ink">
          {featured.kind === "next" ? t("next") : t("latest")}
        </h2>
        <StatusBadge status={plan.status} label={ts(`status.${plan.status}`)} />
      </header>
      <div className="flex flex-1 flex-col gap-5 p-5 md:p-7">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1.5">
            <p className="display text-4xl break-words text-ink md:text-[2.75rem]">{plan.title}</p>
            <p className="text-ink-muted">{[plan.teamName, when].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="shrink-0 text-right">
            <span className="numeral text-6xl leading-none font-bold text-ink">{total}</span>
            <span className="ml-1.5 text-sm font-semibold text-ink-muted uppercase">min</span>
          </p>
        </div>

        <div
          role="img"
          aria-label={t("tallyLabel", { total, count: blocks.length })}
          className="space-y-3"
        >
          <Tally
            segments={blocks.map((b) => ({ id: b.id, minutes: b.minutes, phase: b.phase }))}
            target={plan.targetMinutes}
          />
          {blocks.length > 0 ? (
            <ul aria-hidden className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {[...byPhase].map(([phase, minutes]) => (
                <li key={phase} className="inline-flex items-center gap-2 text-ink-muted">
                  <span
                    className="size-2.5 rounded-[2px]"
                    style={{
                      background:
                        phase === "none"
                          ? "var(--ink-faint)"
                          : `var(--phase-${phase.replaceAll("_", "-")})`,
                    }}
                  />
                  <span className="font-medium text-ink">
                    {phase === "break"
                      ? tdoc("break")
                      : phase === "none"
                        ? t("noPhase")
                        : td(`phases.${phase}`)}
                  </span>
                  <span className="numeral">{minutes}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("noActivities")}</p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href={`/sessions/${sportKey}/${plan.id}`}>
              {t("open")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          {blocks.length > 0 ? (
            <Button asChild variant="ink">
              <Link href={`/sessions/${sportKey}/${plan.id}/run`}>
                <Play className="size-4" aria-hidden />
                {tr("open")}
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href={`/sessions/${sportKey}/${plan.id}/document`}>
              <FileText className="size-4" aria-hidden />
              {t("document")}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
