import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import { hrefFor, type DrillFilters } from "@/modules/drills/filters";

/**
 * Quick filter by drill format (Individual, 1v1, 2v2, 3v3, 4v4, 5v5, Group, Team). The values come from the
 * sport module, so a sport only shows the formats it has. Plain links: pressing the active chip clears it.
 */
export async function FormatChips({
  basePath,
  filters,
  formats,
}: {
  basePath: string;
  filters: DrillFilters;
  formats: readonly string[];
}) {
  const t = await getTranslations("drills");
  if (formats.length === 0) return null;
  return (
    <nav aria-label={t("formatChips.label")}>
      <ul className="flex flex-wrap items-center gap-2">
        {formats.map((f) => {
          const active = filters.format === f;
          return (
            <li key={f}>
              <Link
                href={hrefFor(basePath, { ...filters, format: active ? undefined : f, page: 1 })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "focus-visible:outline-focus inline-flex min-h-10 min-w-12 items-center justify-center rounded-full border px-3.5 py-1 numeral text-sm font-semibold transition-colors focus-visible:outline-2",
                  active
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line-strong bg-surface-raised text-ink hover:border-accent hover:bg-accent-soft",
                )}
              >
                {t.has(`formats.${f}`) ? t(`formats.${f}`) : f}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
