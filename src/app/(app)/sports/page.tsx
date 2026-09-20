import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { CourtMark } from "@/components/ui/court-mark";
import { SectionMarker } from "@/components/ui/section-marker";
import { getSportOverview } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { listActiveSports, listPlannedSportNames } from "@/modules/sports";

export const metadata: Metadata = { title: "Sports" };

export default async function SportsPage() {
  const { actor } = await requireViewer();
  const [t, sports, planned] = await Promise.all([
    getTranslations("sports"),
    listActiveSports(),
    listPlannedSportNames(),
  ]);
  const overviews = await Promise.all(sports.map((s) => getSportOverview(actor, s.key)));

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="display text-5xl text-ink md:text-6xl">{t("title")}</h1>
        <p className="max-w-2xl text-base text-ink-muted">{t("subtitle")}</p>
      </header>

      <section aria-labelledby="active-sports" className="space-y-4">
        <h2 id="active-sports" className="sr-only">
          {t("activeHeading")}
        </h2>
        <ul className="grid gap-5 md:grid-cols-2">
          {sports.map((s, i) => {
            const o = overviews[i];
            return (
              <li key={s.key}>
                <Card className="group relative h-full overflow-hidden transition-colors hover:border-line-strong">
                  <CourtMark className="pointer-events-none absolute -right-10 -bottom-10 h-56 w-auto opacity-40" />
                  <CardBody className="relative flex h-full flex-col gap-6">
                    <div className="space-y-3">
                      <SectionMarker n={i + 1}>{t("workspace")}</SectionMarker>
                      <h3 className="display text-4xl text-ink">
                        <Link
                          href={`/sports/${s.key}`}
                          className="focus-visible:after:outline-focus rounded-xs after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-offset-2"
                        >
                          {s.name}
                        </Link>
                      </h3>
                    </div>
                    <dl className="grid max-w-xs grid-cols-2 gap-4">
                      <div>
                        <dd className="numeral text-4xl leading-none font-semibold text-ink">
                          {o?.libraryCount ?? 0}
                        </dd>
                        <dt className="mt-1 text-sm text-ink-muted">{t("libraryDrills")}</dt>
                      </div>
                      <div>
                        <dd className="numeral text-4xl leading-none font-semibold text-ink">
                          {o?.myCount ?? 0}
                        </dd>
                        <dt className="mt-1 text-sm text-ink-muted">{t("yourDrills")}</dt>
                      </div>
                    </dl>
                    <p className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-accent">
                      {t("open")}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </p>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {planned.length > 0 ? (
        <section aria-labelledby="planned-sports" className="space-y-3 border-t border-line pt-6">
          <h2 id="planned-sports" className="eyebrow">
            {t("plannedTitle")}
          </h2>
          <p className="max-w-2xl text-sm text-ink-muted">{t("plannedBody")}</p>
          <ul className="flex flex-wrap gap-2">
            {planned.map((name) => (
              <li
                key={name}
                className="rounded-full border border-dashed border-line-strong px-3 py-1 text-sm text-ink-muted"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
