import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DrillCard } from "@/components/features/drills/drill-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionMarker } from "@/components/ui/section-marker";
import { can } from "@/lib/authz/can";
import { getSportOverview, parseFilters, searchDrills } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "Overview" };

export default async function SportOverviewPage({ params }: PageProps<"/sports/[sport]">) {
  const { sport: key } = await params;
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();

  const base = parseFilters({});
  const [t, overview, recent, mine] = await Promise.all([
    getTranslations("workspace.overview"),
    getSportOverview(actor, sport.key),
    searchDrills(actor, sport.key, { ...base, scope: "library", sort: "recent" }, { pageSize: 3 }),
    searchDrills(actor, sport.key, { ...base, scope: "mine", sort: "recent" }, { pageSize: 3 }),
  ]);
  if (!overview || !recent || !mine) notFound();
  const canCreate = can(actor, "drill:create", { organizationId: actor.organizationId });
  const drillsHref = `/sports/${sport.key}/drills`;

  return (
    <div className="space-y-12">
      <section aria-label={t("summary")} className="flex flex-wrap items-end justify-between gap-6">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dd className="numeral text-6xl leading-none font-semibold text-ink">
              {overview.libraryCount}
            </dd>
            <dt className="mt-1.5 text-sm text-ink-muted">{t("libraryLabel")}</dt>
          </div>
          <div>
            <dd className="numeral text-6xl leading-none font-semibold text-ink">
              {overview.myCount}
            </dd>
            <dt className="mt-1.5 text-sm text-ink-muted">{t("mineLabel")}</dt>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={drillsHref}>
              {t("browse")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          {canCreate ? (
            <Button asChild variant="secondary" size="lg">
              <Link href={`${drillsHref}/new`}>
                <Plus className="size-4" aria-hidden />
                {t("create")}
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="by-category" className="space-y-4">
        <div className="space-y-2">
          <SectionMarker n={1}>{t("categoriesEyebrow")}</SectionMarker>
          <h2 id="by-category" className="text-xl font-semibold tracking-tight text-ink">
            {t("categoriesTitle")}
          </h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.categories.map((c) => (
            <li key={c.key}>
              <Link
                href={`${drillsHref}?category=${c.key}`}
                className="group flex h-full items-start justify-between gap-4 rounded-lg border border-line bg-surface-raised p-4 transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{c.name}</span>
                  {c.description ? (
                    <span className="mt-1 block text-sm text-ink-muted">{c.description}</span>
                  ) : null}
                </span>
                <span className="numeral text-3xl leading-none font-semibold text-accent">
                  {c.count}
                  <span className="sr-only"> {t("drillsSuffix")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-library" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <SectionMarker n={2}>{t("recentEyebrow")}</SectionMarker>
            <h2 id="recent-library" className="text-xl font-semibold tracking-tight text-ink">
              {t("recentTitle")}
            </h2>
          </div>
          <Link
            href={`${drillsHref}?scope=library`}
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {t("viewAll")}
          </Link>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recent.items.map((d) => (
            <li key={d.id}>
              <DrillCard
                drill={d}
                href={`${drillsHref}/${d.id}`}
                sportKey={sport.key}
                className="h-full"
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="my-drills" className="space-y-4">
        <div className="space-y-2">
          <SectionMarker n={3}>{t("mineEyebrow")}</SectionMarker>
          <h2 id="my-drills" className="text-xl font-semibold tracking-tight text-ink">
            {t("mineTitle")}
          </h2>
        </div>
        {mine.items.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {mine.items.map((d) => (
              <li key={d.id}>
                <DrillCard
                  drill={d}
                  href={`${drillsHref}/${d.id}`}
                  sportKey={sport.key}
                  className="h-full"
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <CardBody>
              <EmptyState
                title={t("mineEmptyTitle")}
                description={t("mineEmptyBody")}
                action={
                  canCreate ? (
                    <Button asChild>
                      <Link href={`${drillsHref}/new`}>
                        <Plus className="size-4" aria-hidden />
                        {t("create")}
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            </CardBody>
          </Card>
        )}
      </section>
    </div>
  );
}
