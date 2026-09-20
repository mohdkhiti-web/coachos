import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { planHrefFor, type PlanFilters } from "@/modules/plans/filters";

/** Prev / next with a "Page x of y" scoreboard, for the session list. */
export async function SessionPagination({
  basePath,
  filters,
  page,
  pageCount,
}: {
  basePath: string;
  filters: PlanFilters;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("drills.pagination");
  const link =
    "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors";
  const active = "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken";
  const ghost = "border-transparent text-transparent select-none";
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-4 pt-2">
      {page > 1 ? (
        <Link
          href={planHrefFor(basePath, { ...filters, page: page - 1 })}
          rel="prev"
          className={cn(link, active)}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("previous")}
        </Link>
      ) : (
        <span aria-hidden className={cn(link, ghost)}>
          {t("previous")}
        </span>
      )}
      <p className="numeral text-lg text-ink" aria-current="page">
        {t("page", { page, count: pageCount })}
      </p>
      {page < pageCount ? (
        <Link
          href={planHrefFor(basePath, { ...filters, page: page + 1 })}
          rel="next"
          className={cn(link, active)}
        >
          {t("next")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cn(link, ghost)}>
          {t("next")}
        </span>
      )}
    </nav>
  );
}
