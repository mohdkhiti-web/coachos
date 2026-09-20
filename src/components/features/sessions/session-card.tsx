import Link from "next/link";
import { CalendarDays, Clock, Layers } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import type { PlanListItemDto } from "@/modules/plans/dto";
import { formatClockTime, formatDateOnly, formatInstantDate } from "@/modules/plans/format";
import { StatusBadge } from "./badges";
import { SessionCardActions } from "./session-card-actions";

/**
 * One session in "My Sessions": what a coach scans for (title, team, age group, level, when, how long, how many
 * activities, status, the main objective) and the actions. The duration is the session's real total, the sum of
 * its activities from the database view, never a typed number.
 */
export async function SessionCard({
  session: s,
  sportKey,
  timeZone,
  className,
}: {
  session: PlanListItemDto;
  sportKey: string;
  /** The viewer's own zone, for the "updated" date. */
  timeZone: string;
  className?: string;
}) {
  const [t, td, locale] = await Promise.all([
    getTranslations("sessions"),
    getTranslations("drills"),
    getLocale(),
  ]);
  const deleted = s.deletedAt !== null;
  const status = deleted ? "deleted" : s.status;
  const facts = [s.teamName, s.ageGroup?.name, s.level ? td(`levels.${s.level}`) : null].filter(
    Boolean,
  ) as string[];

  return (
    <article
      aria-labelledby={`session-${s.id}`}
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4 shadow-paper sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h3
            id={`session-${s.id}`}
            className="text-lg leading-snug font-semibold tracking-tight break-words text-ink"
          >
            {deleted ? (
              s.title
            ) : (
              <Link
                href={`/sessions/${sportKey}/${s.id}`}
                className="rounded-xs hover:underline hover:underline-offset-4"
              >
                {s.title}
              </Link>
            )}
          </h3>
          <p className="text-sm text-ink-muted">
            {facts.length > 0 ? facts.join(" · ") : t("card.noTeam")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s.visibility === "organization" ? (
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted">
              {t("card.shared")}
            </span>
          ) : null}
          <StatusBadge status={status} label={t(`status.${status}`)} />
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            {t("card.date")}
          </dt>
          <dd className="font-medium text-ink">
            {s.scheduledDate ? formatDateOnly(s.scheduledDate, locale) : t("card.notScheduled")}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock className="size-4 shrink-0" aria-hidden />
            {t("card.startTime")}
          </dt>
          <dd className="font-medium text-ink">
            {s.startTime ? formatClockTime(s.startTime, locale) : t("card.noStart")}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Layers className="size-4 shrink-0" aria-hidden />
            {t("card.duration")}
          </dt>
          <dd className="font-medium text-ink">
            <span className="numeral text-base">{s.totalMinutes}</span> {t("card.min")}
            <span className="font-normal text-ink-muted">
              {" · "}
              {t("card.activities", { count: s.activityCount })}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t("card.mainObjective")}</dt>
          <dd className="font-medium text-ink">
            {s.primaryObjective ? (
              s.primaryObjective.name
            ) : (
              <span className="font-normal text-ink-muted">{t("card.noObjective")}</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line pt-3">
        <p className="text-xs text-ink-muted">
          {t("card.updated", { date: formatInstantDate(s.updatedAt, locale, timeZone) })}
        </p>
        <SessionCardActions
          sportKey={sportKey}
          id={s.id}
          title={s.title}
          version={s.version}
          state={deleted ? "deleted" : s.status === "archived" ? "archived" : "live"}
          canManage={s.permissions.canManage}
          canDuplicate={s.permissions.canDuplicate}
        />
      </div>
    </article>
  );
}
