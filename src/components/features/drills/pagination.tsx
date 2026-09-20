import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { hrefFor, type DrillFilters } from "@/modules/drills/filters";

/** Prev/next with a "Page x of y" scoreboard. Links, not buttons: every page is a shareable URL. */
export async function Pagination({
  basePath,
  filters,
  page,
  pageCount,
}: {
  basePath: string;
  filters: DrillFilters;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("drills.pagination");
  const link =
    "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors";

  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-4 pt-2">
      {page > 1 ? (
        <Link
          href={hrefFor(basePath, { ...filters, page: page - 1 })}
          rel="prev"
          className={cn(
            link,
            "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("previous")}
        </Link>
      ) : (
        <span aria-hidden className={cn(link, "border-transparent text-transparent select-none")}>
          {t("previous")}
        </span>
      )}

      <p className="numeral text-lg text-ink" aria-current="page">
        {t("page", { page, count: pageCount })}
      </p>

      {page < pageCount ? (
        <Link
          href={hrefFor(basePath, { ...filters, page: page + 1 })}
          rel="next"
          className={cn(
            link,
            "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
          )}
        >
          {t("next")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cn(link, "border-transparent text-transparent select-none")}>
          {t("next")}
        </span>
      )}
    </nav>
  );
}
