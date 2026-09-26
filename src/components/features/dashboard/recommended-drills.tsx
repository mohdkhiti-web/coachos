import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DrillCard } from "@/components/features/drills/drill-card";
import { Button } from "@/components/ui/button";
import type { Recommendation } from "@/modules/dashboard";
import { hasCoachingProfile, type CoachingProfileDto } from "@/modules/identity";

/**
 * Drills recommended from the coach's own answers: each is a real library drill returned by a real query (category or
 * skill = a priority they chose, age = their age group when they coach exactly one). With no answers there is nothing
 * honest to recommend, so the section says so and offers the profile instead of showing filler.
 */
export async function RecommendedDrills({
  recommendations,
  profile,
  sportKey,
}: {
  recommendations: Recommendation[];
  profile: CoachingProfileDto;
  sportKey: string;
}) {
  const [t, to] = await Promise.all([
    getTranslations("dashboard.cc.recommended"),
    getTranslations("onboarding.flow"),
  ]);
  const personalised = hasCoachingProfile(profile) && profile.priorities.length > 0;
  const details = [
    ...profile.ageGroups.map((k) => to(`q2.options.${k}.label`)),
    ...profile.priorities.slice(0, 3).map((k) => to(`q4.options.${k}.label`)),
  ].join(", ");

  return (
    <section aria-labelledby="rec-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="rec-h" className="text-xl font-semibold tracking-tight text-ink">
            {t("title")}
          </h2>
          {personalised ? (
            <p className="text-sm text-ink-muted">{t("basedOn", { details })}</p>
          ) : null}
        </div>
        <Link
          href={`/sports/${sportKey}/drills`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 smooth-colors hover:underline"
        >
          {t("browse")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {!personalised ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-line-strong px-5 py-5">
          <p className="max-w-lg text-sm text-ink-muted">{t("none")}</p>
          <Button asChild variant="secondary">
            <Link href="/settings/coaching-profile">{t("noneAction")}</Link>
          </Button>
        </div>
      ) : recommendations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-5 py-5 text-sm text-ink-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map(({ drill, priority }, i) => (
            <li
              key={drill.id}
              className="rise"
              style={{ "--rise-delay": `${i * 70}ms` } as React.CSSProperties}
            >
              <p className="mb-2 eyebrow text-accent">
                {t("forPriority", { priority: to(`q4.options.${priority}.label`) })}
              </p>
              <DrillCard
                drill={drill}
                href={`/sports/${sportKey}/drills/${drill.id}`}
                sportKey={sportKey}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
