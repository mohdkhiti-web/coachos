import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { SectionMarker } from "@/components/ui/section-marker";
import { getSportOverview, parseFilters, searchDrills } from "@/modules/drills";
import { listActiveSports } from "@/modules/sports";
import type { WidgetProps } from "./widgets";

/** Real data from the Phase 2 drill library: counts per sport and the user's most recent drills. */
export async function DrillsWidget({ viewer }: WidgetProps) {
  const [t, sports] = await Promise.all([getTranslations("dashboard.drills"), listActiveSports()]);
  const sport = sports[0];
  if (!sport) return null;

  const [overview, mine] = await Promise.all([
    getSportOverview(viewer.actor, sport.key),
    searchDrills(
      viewer.actor,
      sport.key,
      { ...parseFilters({}), scope: "mine", sort: "recent" },
      { pageSize: 3 },
    ),
  ]);
  if (!overview || !mine) return null;
  const base = `/sports/${sport.key}`;

  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-4">
        <SectionMarker n={4}>{t("eyebrow", { sport: sport.name })}</SectionMarker>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t("title")}</h2>
        <dl className="flex gap-8">
          <div>
            <dd className="numeral text-4xl leading-none font-semibold text-ink">
              {overview.libraryCount}
            </dd>
            <dt className="mt-1 text-sm text-ink-muted">{t("library")}</dt>
          </div>
          <div>
            <dd className="numeral text-4xl leading-none font-semibold text-ink">
              {overview.myCount}
            </dd>
            <dt className="mt-1 text-sm text-ink-muted">{t("mine")}</dt>
          </div>
        </dl>
        {mine.items.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line">
            {mine.items.map((d) => (
              <li key={d.id}>
                <Link
                  href={`${base}/drills/${d.id}`}
                  className="block py-2.5 text-sm font-medium text-ink hover:text-accent"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line pt-3 text-sm text-ink-muted">{t("noneYet")}</p>
        )}
        <Link
          href={`${base}/drills`}
          className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("open")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardBody>
    </Card>
  );
}
