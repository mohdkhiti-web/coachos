import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  FormatPill,
  IntensityMeter,
  LevelMeter,
  range,
  ScopeBadge,
  Stat,
} from "@/components/features/drills/drill-badges";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { cn } from "@/lib/cn";
import type { DrillDetailDto } from "@/modules/drills";

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-ink">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A look inside a drill before it is added: its diagram, the facts a coach decides on, and the setup, steps and
 * coaching points. The full drill page is one link away (in a new tab, so the session is not lost).
 */
export async function DrillPreview({
  drill,
  fullHref,
  className,
}: {
  drill: DrillDetailDto;
  fullHref: string;
  className?: string;
}) {
  const t = await getTranslations("drills");
  const ts = await getTranslations("sessions.addDrill");
  const c = drill.content;

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="eyebrow">{drill.category.name}</p>
        <ScopeBadge scope={drill.scope} label={t(`scopes.${drill.scope}`)} />
        <LevelMeter level={drill.level} label={t(`levels.${drill.level}`)} />
        <IntensityMeter intensity={drill.intensity} label={t(`intensities.${drill.intensity}`)} />
        {drill.format ? <FormatPill label={t(`formats.${drill.format}`)} /> : null}
        {drill.primarySkill ? (
          <span className="text-sm text-ink-muted">{drill.primarySkill.name}</span>
        ) : null}
      </div>

      <p className="max-w-3xl text-base text-ink">{drill.description}</p>

      <dl className="grid max-w-md grid-cols-3 gap-4 border-y border-line py-3">
        <Stat value={range(drill.durationMin, drill.durationMax)} label={t("card.minutes")} />
        <Stat value={range(drill.playersMin, drill.playersMax)} label={t("card.players")} />
        <Stat value={range(drill.ageMin, drill.ageMax)} label={t("card.ages")} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="space-y-5">
          <section aria-labelledby="pv-setup" className="space-y-2">
            <h2 id="pv-setup" className="eyebrow">
              {t("detail.setup")}
            </h2>
            <p className="text-sm leading-relaxed text-ink">{c.setup}</p>
            {c.organization ? (
              <p className="text-sm leading-relaxed text-ink-muted">{c.organization}</p>
            ) : null}
          </section>
          <section aria-labelledby="pv-steps" className="space-y-2">
            <h2 id="pv-steps" className="eyebrow">
              {t("detail.instructions")}
            </h2>
            <Bullets items={c.instructions} />
          </section>
          <section aria-labelledby="pv-points" className="space-y-2">
            <h2 id="pv-points" className="eyebrow">
              {t("detail.coachingPoints")}
            </h2>
            <Bullets items={c.coachingPoints} />
          </section>
        </div>

        {drill.diagrams.length > 0 ? (
          <div className="space-y-3">
            {drill.diagrams.slice(0, 2).map((g) => (
              <figure
                key={g.id}
                className="overflow-hidden rounded-lg border border-line bg-surface-sunken"
              >
                <DrillDiagram
                  diagram={g.diagram}
                  title={g.title || drill.title}
                  className="w-full p-1"
                />
                {g.title ? (
                  <figcaption className="border-t border-line px-3 py-1.5 text-xs text-ink-muted">
                    {g.title}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      <a
        href={fullHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        <ExternalLink className="size-4" aria-hidden />
        {ts("fullDrill")}
        <span className="sr-only"> {ts("newTab")}</span>
      </a>
    </div>
  );
}
