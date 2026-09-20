import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { DrillActions } from "@/components/features/drills/drill-actions";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { LevelMeter, range, ScopeBadge, Stat } from "@/components/features/drills/drill-badges";
import { SectionMarker } from "@/components/ui/section-marker";
import { cn } from "@/lib/cn";
import { getDrill } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Drill" };

function BulletList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5 text-base leading-relaxed text-ink", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DrillDetailPage({
  params,
}: PageProps<"/sports/[sport]/drills/[id]">) {
  const { sport: key, id } = await params;
  const { actor } = await requireViewer();
  const drill = await getDrill(actor, key, id); // RLS: not yours to see → null → 404
  if (!drill) notFound();

  const [t, format] = await Promise.all([getTranslations("drills"), getFormatter()]);
  const base = `/sports/${drill.sportKey}/drills`;
  const c = drill.content;
  const isLibrary = drill.scope === "library";
  const archived = drill.status === "archived";
  const sections: Array<{ id: string; title: string; items: string[] }> = [
    { id: "progressions", title: t("detail.progressions"), items: c.progressions },
    { id: "regressions", title: t("detail.regressions"), items: c.regressions },
    { id: "variations", title: t("detail.variations"), items: c.variations },
  ].filter((s) => s.items.length > 0);

  return (
    <article className="space-y-10" aria-labelledby="drill-title">
      <div className="space-y-5">
        <Link
          href={base}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("detail.back")}
        </Link>

        {archived ? (
          <p
            role="status"
            className="rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm font-medium text-ink"
          >
            {t("detail.archivedNotice")}
          </p>
        ) : null}

        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow">{drill.category.name}</p>
            <ScopeBadge scope={drill.scope} label={t(`scopes.${drill.scope}`)} />
          </div>
          <h2 id="drill-title" className="max-w-3xl display text-4xl text-ink md:text-6xl">
            {drill.title}
          </h2>
          <p className="max-w-3xl text-lg leading-relaxed text-ink-muted">{drill.description}</p>
          <DrillActions
            sportKey={drill.sportKey}
            drillId={drill.id}
            title={drill.title}
            isLibrary={isLibrary}
            permissions={drill.permissions}
          />
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat value={range(drill.durationMin, drill.durationMax)} label={t("card.minutes")} />
          <Stat value={range(drill.playersMin, drill.playersMax)} label={t("card.players")} />
          <Stat value={range(drill.ageMin, drill.ageMax)} label={t("card.ages")} />
          {/* term first in the DOM (reads "Level: Beginner"), value shown above it */}
          <div className="flex min-w-0 flex-col-reverse">
            <dt className="mt-2 text-xs text-ink-muted">{t("detail.level")}</dt>
            <dd>
              <LevelMeter
                level={drill.level}
                label={t(`levels.${drill.level}`)}
                className="text-base"
              />
            </dd>
          </div>
          <div className="flex min-w-0 flex-col-reverse">
            <dt className="mt-1 text-xs text-ink-muted">{t("detail.space")}</dt>
            <dd className="text-base font-medium text-ink">{t(`spaces.${drill.space}`)}</dd>
          </div>
          <div className="flex min-w-0 flex-col-reverse">
            <dt className="mt-1 text-xs text-ink-muted">{t("detail.primarySkill")}</dt>
            <dd className="text-base font-medium text-ink">{drill.primarySkill?.name ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {drill.diagrams.length > 0 ? (
        <section
          aria-label={t("detail.diagrams")}
          className={cn("grid gap-6", drill.diagrams.length > 1 && "lg:grid-cols-2")}
        >
          {drill.diagrams.map((g, i) => (
            <figure
              key={g.id}
              className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-paper"
            >
              <DrillDiagram
                diagram={g.diagram}
                title={g.title || t("detail.diagramN", { n: i + 1 })}
                className="mx-auto max-h-[36rem] w-full"
              />
              {g.title ? (
                <figcaption className="border-t border-line px-4 py-3 text-sm font-medium text-ink">
                  <span className="mr-2 numeral text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {g.title}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </section>
      ) : null}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <section aria-labelledby="objective" className="space-y-3">
            <SectionMarker as="h3" id="objective" n={1}>
              {t("detail.objective")}
            </SectionMarker>
            <p className="text-xl leading-relaxed font-medium text-ink">{c.objective}</p>
          </section>

          <section aria-labelledby="setup" className="space-y-3">
            <SectionMarker as="h3" id="setup" n={2}>
              {t("detail.setup")}
            </SectionMarker>
            <p className="text-lg leading-relaxed text-ink">{c.setup}</p>
          </section>

          <section aria-labelledby="how" className="space-y-4">
            <SectionMarker as="h3" id="how" n={3}>
              {t("detail.instructions")}
            </SectionMarker>
            <ol className="space-y-4">
              {c.instructions.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span
                    className="w-9 shrink-0 text-right numeral text-3xl leading-none font-semibold text-accent"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-lg leading-relaxed text-ink">
                    <span className="sr-only">{t("detail.stepN", { n: i + 1 })} </span>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="points" className="space-y-4">
            <SectionMarker as="h3" id="points" n={4}>
              {t("detail.coachingPoints")}
            </SectionMarker>
            <BulletList items={c.coachingPoints} className="text-lg" />
          </section>

          {c.commonMistakes.length > 0 ? (
            <section aria-labelledby="mistakes" className="space-y-4">
              <SectionMarker as="h3" id="mistakes" n={5}>
                {t("detail.commonMistakes")}
              </SectionMarker>
              <BulletList items={c.commonMistakes} className="text-lg" />
            </section>
          ) : null}

          {sections.length > 0 ? (
            <section
              aria-label={t("detail.developing")}
              className="grid gap-8 border-t border-line pt-8 md:grid-cols-2"
            >
              {sections.map((s) => (
                <div
                  key={s.id}
                  className={cn("space-y-3", sections.length === 1 && "md:col-span-2")}
                >
                  <h3 className="eyebrow">{s.title}</h3>
                  <BulletList items={s.items} />
                </div>
              ))}
            </section>
          ) : null}

          {c.safety ? (
            <section
              aria-labelledby="safety"
              className="rounded-lg border border-warning bg-warning-soft p-5"
            >
              <h3 id="safety" className="mb-2 eyebrow text-ink">
                {t("detail.safety")}
              </h3>
              <p className="text-base leading-relaxed text-ink">{c.safety}</p>
            </section>
          ) : null}
        </div>

        <aside aria-label={t("detail.sidebar")} className="space-y-8">
          <section aria-labelledby="equipment" className="space-y-3">
            <h3 id="equipment" className="eyebrow">
              {t("detail.equipment")}
            </h3>
            {drill.equipment.length > 0 ? (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface-raised">
                {drill.equipment.map((e) => (
                  <li key={e.key} className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <span className="font-medium text-ink">{e.name}</span>
                    <span className="numeral text-sm text-ink-muted">
                      {t(`detail.rule.${e.rule}`, { quantity: e.quantity })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{t("detail.noEquipment")}</p>
            )}
          </section>

          <section aria-labelledby="skills" className="space-y-3">
            <h3 id="skills" className="eyebrow">
              {t("detail.skills")}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {drill.skills.map((s) => (
                <li
                  key={s.key}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    s.role === "primary"
                      ? "border-accent bg-accent-soft font-semibold text-accent-strong"
                      : "border-line-strong text-ink-muted",
                  )}
                >
                  {s.name}
                  {s.role === "primary" ? (
                    <span className="sr-only"> ({t("detail.primarySkill")})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {drill.tags.length > 0 ? (
            <section aria-labelledby="tags" className="space-y-3">
              <h3 id="tags" className="eyebrow">
                {t("detail.tags")}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {drill.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={`${base}?q=${encodeURIComponent(tag)}`}
                      className="inline-block rounded-xs border border-line bg-surface px-2 py-0.5 text-sm text-ink-muted hover:border-accent hover:text-ink"
                    >
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {c.resources.length > 0 ? (
            <section aria-labelledby="resources" className="space-y-3">
              <h3 id="resources" className="eyebrow">
                {t("detail.resources")}
              </h3>
              <ul className="space-y-2">
                {c.resources.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
                    >
                      {r.title}
                      <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only">
                        ({t(`detail.resourceKind.${r.kind}`)}, {t("detail.opensNewTab")})
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="source" className="space-y-2 border-t border-line pt-6">
            <h3 id="source" className="eyebrow">
              {t("detail.source")}
            </h3>
            <p className="text-sm text-ink">
              {isLibrary && drill.source.kind === "original"
                ? t("detail.sourceLibrary")
                : t(`detail.sourceKind.${drill.source.kind}`)}
              {drill.source.name ? (
                <span className="text-ink-muted"> — {drill.source.name}</span>
              ) : null}
            </p>
            {drill.source.url ? (
              <a
                href={drill.source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                {t("detail.sourceLink")}
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">({t("detail.opensNewTab")})</span>
              </a>
            ) : null}
            <p className="text-xs text-ink-muted">
              {t("detail.updated", {
                date: format.dateTime(drill.updatedAt, { dateStyle: "medium" }),
              })}
            </p>
          </section>
        </aside>
      </div>
    </article>
  );
}
