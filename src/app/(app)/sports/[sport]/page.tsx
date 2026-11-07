import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DrillCard } from "@/components/features/drills/drill-card";
import { CinematicVideo } from "@/components/basketball/cinematic-video";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
      <div className="relative h-52 overflow-hidden rounded-xl border border-line bg-rail shadow-paper sm:h-64 md:h-80">
        {sport.key === "wheelchair_basketball" ? (
          <CinematicVideo
            sources={[{ src: "/videos/wheelchair.webm", type: "video/webm" }]}
            poster="/images/cinematic/wheelchair-poster.jpg"
            pauseLabel={t("videoPause")}
            playLabel={t("videoPlay")}
            className="h-full w-full object-[50%_18%]"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- decorative banner, compressed WebP
          <img
            src="/images/cinematic/arena.webp"
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-[50%_62%]"
          />
        )}
      </div>

      <section
        aria-label={t("summary")}
        className="flex flex-wrap items-center justify-between gap-6"
      >
        <dl className="flex divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface-raised shadow-paper">
          <div className="flex flex-col-reverse gap-1 px-5 py-3">
            <dt className="eyebrow">{t("libraryLabel")}</dt>
            <dd className="numeral text-4xl leading-none font-bold text-ink">
              {overview.libraryCount}
            </dd>
          </div>
          <div className="flex flex-col-reverse gap-1 px-5 py-3">
            <dt className="eyebrow">{t("mineLabel")}</dt>
            <dd className="numeral text-4xl leading-none font-bold text-ink">{overview.myCount}</dd>
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
        <h2 id="by-category" className="text-2xl font-semibold tracking-tight text-ink">
          {t("categoriesTitle")}
        </h2>
        {/* The category index: one ruled sheet, each row a category with its share of the library as a bar */}
        <ul className="grid overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper sm:grid-cols-2 lg:grid-cols-3 [&>li]:border-line max-sm:[&>li+li]:border-t lg:[&>li:not(:nth-child(3n))]:border-r sm:max-lg:[&>li:nth-child(n+3)]:border-t lg:[&>li:nth-child(n+4)]:border-t sm:max-lg:[&>li:nth-child(odd)]:border-r">
          {overview.categories.map((c) => {
            const max = Math.max(1, ...overview.categories.map((x) => x.count));
            return (
              <li key={c.key}>
                <Link
                  href={`${drillsHref}?category=${c.key}`}
                  className="group flex h-full flex-col gap-3 p-4 smooth-colors hover:bg-surface-sunken focus-visible:-outline-offset-2"
                >
                  <span className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{c.name}</span>
                      {c.description ? (
                        <span className="mt-0.5 line-clamp-1 block text-sm text-ink-muted">
                          {c.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="numeral text-3xl leading-none font-bold text-ink group-hover:text-accent">
                      {c.count}
                      <span className="sr-only"> {t("drillsSuffix")}</span>
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="mt-auto block h-1 overflow-hidden rounded-full bg-surface-sunken"
                  >
                    <span
                      className="block h-full origin-left rounded-full bg-accent-bright transition-transform duration-300 ease-out group-hover:scale-x-105"
                      style={{ width: `${(c.count / max) * 100}%` }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="recent-library" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-library" className="text-2xl font-semibold tracking-tight text-ink">
            {t("recentTitle")}
          </h2>
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
        <h2 id="my-drills" className="text-2xl font-semibold tracking-tight text-ink">
          {t("mineTitle")}
        </h2>
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
