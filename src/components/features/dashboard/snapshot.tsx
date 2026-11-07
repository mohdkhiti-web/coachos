import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { CommandCenterDto } from "@/modules/dashboard";
import type { SportOverviewDto } from "@/modules/drills/dto";

const TOP_CATEGORIES = 6;

/**
 * The register: the workspace's real counts as ruled rows, the way a scoresheet keeps its tallies. Left, the coach's
 * own sheet (sessions, favourites, squad); right, the library at a glance, the biggest categories with their real
 * drill counts and their share of the library. Every row links to where that number lives.
 */
export async function Snapshot({
  data,
  overview,
  sportKey,
  squadSize,
}: {
  data: CommandCenterDto;
  overview: SportOverviewDto | null;
  sportKey: string;
  squadSize: number | null;
}) {
  const t = await getTranslations("dashboard.cc.snapshot");
  const categories = [...(overview?.categories ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_CATEGORIES);
  const max = Math.max(1, ...categories.map((c) => c.count));
  const drills = `/sports/${sportKey}/drills`;

  const rows: Array<{ label: string; value: string | number; unit?: string; href: string }> = [
    {
      label: t("sessions"),
      value: data.sessionCount,
      unit: t("sessionsUnit", { count: data.sessionCount }),
      href: `/sessions/${sportKey}`,
    },
    {
      label: t("favorites"),
      value: data.favoriteCount,
      unit: t("favoritesUnit", { count: data.favoriteCount }),
      href: `${drills}${data.favoriteCount > 0 ? "?favorites=1" : ""}`,
    },
    {
      label: t("squad"),
      value: squadSize ?? "–",
      unit: squadSize ? t("squadUnit", { count: squadSize }) : t("squadNone"),
      href: "/settings/coaching-profile",
    },
  ];

  return (
    <section
      aria-labelledby="snapshot-h"
      className="grid overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
    >
      <div className="border-line max-lg:border-b lg:border-r">
        <h2
          id="snapshot-h"
          className="border-b border-line px-5 py-3 text-base font-semibold text-ink"
        >
          {t("title")}
        </h2>
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.label}>
              <Link
                href={r.href}
                className="group flex items-baseline justify-between gap-4 px-5 py-3 smooth-colors hover:bg-surface-sunken focus-visible:-outline-offset-2"
              >
                <dt className="text-sm text-ink-muted">{r.label}</dt>
                <dd className="flex items-baseline gap-1.5">
                  <span className="numeral text-2xl leading-none font-bold text-ink">
                    {r.value}
                  </span>
                  {r.unit ? <span className="text-sm text-ink-muted">{r.unit}</span> : null}
                </dd>
              </Link>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h3 className="text-base font-semibold text-ink">{t("library")}</h3>
          <Link
            href={drills}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {overview?.libraryCount ?? data.libraryCount}{" "}
            {t("libraryUnit", { count: overview?.libraryCount ?? data.libraryCount })}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="grid overflow-hidden sm:grid-cols-2 [&>li]:-mr-px [&>li]:-mb-px [&>li]:border-r [&>li]:border-b [&>li]:border-line">
          {categories.map((c) => (
            <li key={c.key}>
              <Link
                href={`${drills}?category=${c.key}`}
                className="group flex flex-col gap-2 px-5 py-3 smooth-colors hover:bg-surface-sunken focus-visible:-outline-offset-2"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                  <span className="numeral text-xl leading-none font-bold text-ink">{c.count}</span>
                </span>
                <span
                  aria-hidden
                  className="block h-1 overflow-hidden rounded-full bg-surface-sunken"
                >
                  <span
                    className="block h-full rounded-full bg-accent-bright"
                    style={{ width: `${(c.count / max) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
