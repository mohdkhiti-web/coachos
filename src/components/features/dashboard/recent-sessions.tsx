import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BasketballEmptyState } from "@/components/basketball";
import { Button } from "@/components/ui/button";
import type { PlanListItemDto } from "@/modules/plans";
import { formatClockTime, formatDateOnly } from "@/modules/plans/format";

/** The coach's latest sessions (real, from the sessions list) — or a coach-voiced empty state with a working next step. */
export async function RecentSessions({
  sessions,
  sportKey,
}: {
  sessions: PlanListItemDto[];
  sportKey: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("dashboard.cc.recent"), getLocale()]);

  return (
    <section
      aria-labelledby="recent-h"
      className="rounded-xl border border-line bg-surface-raised shadow-paper"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="recent-h" className="text-lg font-semibold tracking-tight text-ink">
          {t("title")}
        </h2>
        {sessions.length > 0 ? (
          <Link
            href={`/sessions/${sportKey}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 smooth-colors hover:underline"
          >
            {t("viewAll")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <BasketballEmptyState
          scene="planning"
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button asChild>
              <Link href={`/sessions/${sportKey}/new`}>
                <Plus className="size-4" aria-hidden />
                {t("emptyAction")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${sportKey}/${s.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5 smooth-colors hover:bg-surface-sunken"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{s.title}</span>
                  <span className="mt-0.5 block truncate text-sm text-ink-muted">
                    {[
                      s.teamName,
                      s.scheduledDate
                        ? [
                            formatDateOnly(s.scheduledDate, locale, false),
                            s.startTime ? formatClockTime(s.startTime, locale) : null,
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : t("unscheduled"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 numeral text-lg text-ink-muted">
                  {t("minutes", { count: s.totalMinutes })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
