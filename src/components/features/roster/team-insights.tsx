import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import type { SquadProfile, TeamDto, TeamPulse } from "@/modules/roster";
import { SessionLine, WeekStrip } from "./team-sheet";

/**
 * The team page's side of the sheet: how the squad is made up and how it has been training. Real numbers only — a
 * panel with nothing to show says so in a line, it never draws an empty chart.
 */

/** The register strip under the team name: four ruled figures. */
export async function TeamStats({
  team,
  pulse,
  squad,
}: {
  team: TeamDto;
  pulse: TeamPulse;
  squad: SquadProfile;
}) {
  const t = await getTranslations("roster.sheet");
  const items = [
    { label: t("playersLabel"), value: team.playerCount },
    { label: t("medianAge"), value: squad.medianAge ?? "–" },
    { label: t("sessions28"), value: pulse.sessions28 },
    { label: t("minutes28"), value: pulse.minutes28 },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper sm:grid-cols-4">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            "animate-fade-up px-5 py-4",
            i > 0 && "sm:border-l sm:border-line",
            i % 2 === 1 && "max-sm:border-l max-sm:border-line",
            i > 1 && "max-sm:border-t max-sm:border-line",
          )}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <dd className="display numeral text-4xl leading-none text-ink">{it.value}</dd>
          <dt className="mt-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
            {it.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

/** Players by age (from dates of birth), one bar per year. */
export async function AgeProfile({ squad, total }: { squad: SquadProfile; total: number }) {
  const t = await getTranslations("roster.sheet");
  const max = Math.max(1, ...squad.ages.map((a) => a.count));
  return (
    <section aria-labelledby="ages-h" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="ages-h" className="text-base font-semibold text-ink">
          {t("ageProfile")}
        </h3>
        {squad.withAge < total ? (
          <span className="text-xs text-ink-muted">
            {t("withoutDob", { count: total - squad.withAge })}
          </span>
        ) : null}
      </div>
      {squad.ages.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("noAges")}</p>
      ) : (
        <ol className="flex h-28 items-end gap-1.5" aria-label={t("ageProfile")}>
          {squad.ages.map((a, i) => (
            <li key={a.age} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="numeral text-xs text-ink-muted">{a.count}</span>
              <span
                aria-hidden
                className="block w-full max-w-10 animate-grow-y rounded-t-[4px] bg-ink"
                style={{ height: `${(a.count / max) * 70}%`, animationDelay: `${i * 50}ms` }}
              />
              <span className="numeral text-xs font-medium text-ink">
                <span className="sr-only">{t("ageN", { count: a.count, age: a.age })}</span>
                <span aria-hidden>{a.age}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const POINTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];

/** Wheelchair basketball: the squad's classification points, 1.0 to 4.5. Only shown when any player has one. */
export async function ClassificationProfile({ squad }: { squad: SquadProfile }) {
  if (squad.classifications.length === 0) return null;
  const t = await getTranslations("roster.sheet");
  const counts = new Map(squad.classifications.map((c) => [c.points, c.count]));
  const max = Math.max(1, ...squad.classifications.map((c) => c.count));
  return (
    <section aria-labelledby="class-h" className="space-y-3">
      <h3 id="class-h" className="text-base font-semibold text-ink">
        {t("classification")}
      </h3>
      <ol className="flex h-24 items-end gap-1" aria-label={t("classification")}>
        {POINTS.map((p, i) => {
          const n = counts.get(p) ?? 0;
          return (
            <li key={p} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              {n ? <span className="numeral text-xs text-ink-muted">{n}</span> : null}
              <span
                aria-hidden
                className={cn(
                  "block w-full animate-grow-y rounded-t-[3px]",
                  n ? "bg-accent-bright" : "h-px! rounded-none bg-line-strong",
                )}
                style={{ height: `${(n / max) * 62}%`, animationDelay: `${i * 40}ms` }}
              />
              <span className="numeral text-[11px] text-ink">
                <span className="sr-only">{t("pointsN", { count: n, points: p.toFixed(1) })}</span>
                <span aria-hidden>{p.toFixed(1)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The team's training: eight weeks of minutes, what's next, what was done. */
export async function TeamTraining({ team, pulse }: { team: TeamDto; pulse: TeamPulse }) {
  const t = await getTranslations("roster.sheet");
  const total = pulse.weeks.reduce((a, b) => a + b, 0);
  return (
    <section aria-labelledby="training-h" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="training-h" className="text-base font-semibold text-ink">
          {t("training")}
        </h3>
        <span className="text-xs text-ink-muted">{t("eightWeeks")}</span>
      </div>
      {total === 0 && pulse.upcoming.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("noSessions", { team: team.name })}</p>
      ) : (
        <>
          <WeekStrip
            weeks={pulse.weeks}
            label={t("weeksLabel", { minutes: total })}
            className="h-16"
          />
          {pulse.upcoming.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {pulse.upcoming.map((s) => (
                <li key={s.id}>
                  <SessionLine session={s} sportKey={team.sportKey} kind="next" />
                </li>
              ))}
            </ul>
          ) : null}
          {pulse.recent.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {pulse.recent.map((s) => (
                <li key={s.id}>
                  <SessionLine session={s} sportKey={team.sportKey} kind="last" />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <Link
        href={`/sessions/${team.sportKey}/new?team=${encodeURIComponent(team.name)}`}
        className="inline-flex min-h-11 press items-center gap-2 rounded-md bg-accent-bright px-4 text-sm font-semibold text-accent-ink smooth-colors hover:bg-accent-bright-strong"
      >
        <Plus className="size-4" aria-hidden />
        {t("planFor")}
      </Link>
    </section>
  );
}
