import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import {
  planHrefFor,
  STATUS_FILTERS,
  type PlanFilters,
  type StatusFilter,
} from "@/modules/plans/filters";

/** Active · Draft · Published · Archived · Deleted: one click between the views of My Sessions (plain links, shareable). */
export async function SessionStatusTabs({
  basePath,
  filters,
}: {
  basePath: string;
  filters: PlanFilters;
}) {
  const t = await getTranslations("sessions");
  const items: Array<{ key: StatusFilter | "active"; label: string }> = [
    { key: "active", label: t("filters.statusActive") },
    ...STATUS_FILTERS.map((s) => ({ key: s, label: t(`status.${s}`) })),
  ];
  return (
    <nav aria-label={t("filters.statusNav")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-2">
        {items.map((item) => {
          const current = (filters.status ?? "active") === item.key;
          return (
            <li key={item.key}>
              <Link
                href={planHrefFor(basePath, {
                  ...filters,
                  status: item.key === "active" ? undefined : item.key,
                  page: 1,
                })}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                  current
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line-strong bg-surface-raised text-ink-muted hover:border-accent hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
