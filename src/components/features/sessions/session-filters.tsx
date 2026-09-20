"use client";

import { useTranslations } from "next-intl";
import { FilterForm } from "@/components/features/drills/filter-form";
import { Field, Input, Select } from "@/components/ui/field";
import { activePlanFilterCount, STATUS_FILTERS, type PlanFilters } from "@/modules/plans/filters";

/**
 * Search and filters for My Sessions: search, status, age group, team and a date range. The same enhanced GET form
 * as the drill library (works without JavaScript; results update in place; every filtered view is a shareable link).
 */
export function SessionFilters({
  filters,
  ageGroups,
  teams,
}: {
  filters: PlanFilters;
  ageGroups: Array<{ key: string; name: string }>;
  teams: string[];
}) {
  const t = useTranslations("sessions.filters");
  const ts = useTranslations("sessions.status");

  return (
    <FilterForm activeCount={activePlanFilterCount(filters)}>
      <Field label={t("search")}>
        {(c) => (
          <Input
            {...c}
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
          />
        )}
      </Field>
      <Field label={t("status")}>
        {(c) => (
          <Select {...c} name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("statusActive")}</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("age")}>
        {(c) => (
          <Select {...c} name="age" defaultValue={filters.age ?? ""}>
            <option value="">{t("ageAny")}</option>
            {ageGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("team")}>
        {(c) => (
          <Select {...c} name="team" defaultValue={filters.team ?? ""}>
            <option value="">{t("teamAny")}</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("from")}>
          {(c) => <Input {...c} type="date" name="from" defaultValue={filters.from ?? ""} />}
        </Field>
        <Field label={t("to")}>
          {(c) => <Input {...c} type="date" name="to" defaultValue={filters.to ?? ""} />}
        </Field>
      </div>
    </FilterForm>
  );
}
