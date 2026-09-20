import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { X } from "lucide-react";
import { hrefFor, type DrillFilters } from "@/modules/drills/filters";
import type { Taxonomy } from "@/modules/sports";

/** Removable chips for the filters currently applied — server-rendered links, so they work everywhere. */
export async function ActiveFilters({
  basePath,
  filters,
  taxonomy,
}: {
  basePath: string;
  filters: DrillFilters;
  taxonomy: Taxonomy;
}) {
  const t = await getTranslations("drills");
  const name = (items: Taxonomy["categories"], key?: string) =>
    items.find((i) => i.key === key)?.name ?? key;

  const chips: Array<{ id: string; label: string; without: Partial<DrillFilters> }> = [];
  if (filters.q)
    chips.push({ id: "q", label: t("chips.q", { value: filters.q }), without: { q: "" } });
  if (filters.scope !== "all")
    chips.push({
      id: "scope",
      label: t(`scopes.filter.${filters.scope}`),
      without: { scope: "all" },
    });
  if (filters.category)
    chips.push({
      id: "category",
      label: name(taxonomy.categories, filters.category)!,
      without: { category: undefined },
    });
  if (filters.skill)
    chips.push({
      id: "skill",
      label: name(taxonomy.skills, filters.skill)!,
      without: { skill: undefined },
    });
  if (filters.level)
    chips.push({ id: "level", label: t(`levels.${filters.level}`), without: { level: undefined } });
  if (filters.age !== undefined)
    chips.push({
      id: "age",
      label: t("chips.age", { value: filters.age }),
      without: { age: undefined },
    });
  if (filters.players !== undefined)
    chips.push({
      id: "players",
      label: t("chips.players", { value: filters.players }),
      without: { players: undefined },
    });
  if (filters.duration)
    chips.push({
      id: "duration",
      label: t(`durations.${filters.duration}`),
      without: { duration: undefined },
    });
  if (filters.equipment)
    chips.push({
      id: "equipment",
      label: name(taxonomy.equipment, filters.equipment)!,
      without: { equipment: undefined },
    });
  if (filters.intensity)
    chips.push({
      id: "intensity",
      label: t("chips.intensity", { value: t(`intensities.${filters.intensity}`) }),
      without: { intensity: undefined },
    });
  // (the format is shown — and cleared — by the highlighted chip in the format row, so it has no chip here)
  if (filters.phase)
    chips.push({
      id: "phase",
      label: t("chips.phase", { value: t(`phases.${filters.phase}`) }),
      without: { phase: undefined },
    });
  if (filters.favorites)
    chips.push({ id: "favorites", label: t("filters.favorites"), without: { favorites: false } });
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("chips.label")}>
      {chips.map((c) => (
        <li key={c.id}>
          <Link
            href={hrefFor(basePath, { ...filters, ...c.without, page: 1 })}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-3 py-1 text-sm text-ink transition-colors hover:border-accent hover:bg-accent-soft"
            aria-label={t("chips.remove", { label: c.label })}
          >
            {c.label}
            <X className="size-3.5 text-ink-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
