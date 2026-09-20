import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActiveFilters } from "@/components/features/drills/active-filters";
import { DrillCard } from "@/components/features/drills/drill-card";
import { LibraryFilters } from "@/components/features/drills/library-filters";
import { Pagination } from "@/components/features/drills/pagination";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/authz/can";
import { activeFilterCount, hrefFor, parseFilters, searchDrills } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getSport, getTaxonomy } from "@/modules/sports";

export const metadata: Metadata = { title: "Drills" };

export default async function DrillLibraryPage({
  params,
  searchParams,
}: PageProps<"/sports/[sport]/drills">) {
  const [{ sport: key }, sp] = await Promise.all([params, searchParams]);
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();

  const filters = parseFilters(sp); // lenient: the URL is untrusted
  const basePath = `/sports/${sport.key}/drills`;
  const [t, result, taxonomy] = await Promise.all([
    getTranslations("drills"),
    searchDrills(actor, sport.key, filters),
    getTaxonomy(sport.id),
  ]);
  if (!result) notFound();

  const filtered = activeFilterCount(filters) > 0;
  const canCreate = can(actor, "drill:create", { organizationId: actor.organizationId });
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <aside aria-label={t("filters.region")} className="md:sticky md:top-24 md:self-start">
        <LibraryFilters filters={filters} taxonomy={taxonomy} />
      </aside>

      <section aria-labelledby="library-heading" className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 id="library-heading" className="text-2xl font-semibold tracking-tight text-ink">
              {t("title")}
            </h2>
            <p role="status" aria-live="polite" className="text-sm text-ink-muted">
              {result.total === 0 ? (
                t("results.none")
              ) : result.pageCount === 1 ? (
                // everything fits on one page: "2 drills", not "1–2 of 2 drills"
                <span className="numeral text-base text-ink">
                  {t("results.all", { total: result.total })}
                </span>
              ) : (
                <>
                  <span className="numeral text-base text-ink">
                    {from}–{to}
                  </span>{" "}
                  {t("results.of", { total: result.total })}
                </>
              )}
            </p>
          </div>
          {canCreate ? (
            <Button asChild>
              <Link href={`${basePath}/new`}>
                <Plus className="size-4" aria-hidden />
                {t("create")}
              </Link>
            </Button>
          ) : null}
        </header>

        <ActiveFilters basePath={basePath} filters={filters} taxonomy={taxonomy} />

        {result.items.length > 0 ? (
          <>
            <ul className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
              {result.items.map((d) => (
                <li key={d.id}>
                  <DrillCard drill={d} href={`${basePath}/${d.id}`} className="h-full" />
                </li>
              ))}
            </ul>
            <Pagination
              basePath={basePath}
              filters={filters}
              page={result.page}
              pageCount={result.pageCount}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong">
            {filtered ? (
              <EmptyState
                title={t("empty.filteredTitle")}
                description={t("empty.filteredBody")}
                action={
                  <Button asChild variant="secondary">
                    <Link href={hrefFor(basePath, {})}>{t("filters.clear")}</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState title={t("empty.noneTitle")} description={t("empty.noneBody")} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
