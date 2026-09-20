import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActiveFilters } from "@/components/features/drills/active-filters";
import { DrillCard } from "@/components/features/drills/drill-card";
import { FormatChips } from "@/components/features/drills/format-chips";
import { LibraryFilters } from "@/components/features/drills/library-filters";
import { Pagination } from "@/components/features/drills/pagination";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { DrillPage } from "@/modules/drills";
import { activeFilterCount, hrefFor, type DrillFilters } from "@/modules/drills";
import type { Taxonomy } from "@/modules/sports";

/**
 * The drill selector: the drill library's OWN search and filters (the same URL-driven components, the same server
 * search), pointed at a session. Nothing here searches drills itself. A result opens a preview with the add form,
 * so the coach can look before committing.
 */
export async function DrillPicker({
  sportKey,
  basePath,
  drillHref,
  backHref,
  backLabel,
  title,
  subtitle,
  addLabel,
  filters,
  taxonomy,
  formats,
  result,
}: {
  sportKey: string;
  /** The page's own path: filters, chips and paging build their links from it. */
  basePath: string;
  drillHref: (drillId: string) => string;
  backHref: string;
  backLabel: string;
  title: string;
  subtitle: string;
  addLabel: string;
  filters: DrillFilters;
  taxonomy: Taxonomy;
  formats: readonly string[];
  result: DrillPage;
}) {
  const t = await getTranslations("drills");
  const filtered = activeFilterCount(filters) > 0;
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
        <h1 className="display text-4xl text-ink md:text-5xl">{title}</h1>
        <p className="max-w-2xl text-base text-ink-muted">{subtitle}</p>
      </header>

      <div className="grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <aside aria-label={t("filters.region")} className="md:sticky md:top-24 md:self-start">
          <LibraryFilters filters={filters} taxonomy={taxonomy} />
        </aside>

        <section aria-labelledby="picker-results" className="min-w-0 space-y-5">
          <h2 id="picker-results" className="sr-only">
            {t("title")}
          </h2>
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            {result.total === 0 ? (
              t("results.none")
            ) : result.pageCount === 1 ? (
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

          <FormatChips basePath={basePath} filters={filters} formats={formats} />
          <ActiveFilters basePath={basePath} filters={filters} taxonomy={taxonomy} />

          {result.items.length > 0 ? (
            <>
              <ul className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                {result.items.map((d) => (
                  <li key={d.id}>
                    <DrillCard
                      drill={d}
                      href={drillHref(d.id)}
                      sportKey={sportKey}
                      className="h-full"
                      footer={
                        <Button asChild variant="secondary" className="w-full">
                          <Link href={drillHref(d.id)} aria-label={`${addLabel}: ${d.title}`}>
                            <Plus className="size-4" aria-hidden />
                            {addLabel}
                          </Link>
                        </Button>
                      }
                    />
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
    </div>
  );
}
