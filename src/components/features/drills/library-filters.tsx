"use client";

import { useTranslations } from "next-intl";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { DRILL_PHASES, INTENSITIES, LEVELS } from "@/db/enums";
import {
  activeFilterCount,
  DURATION_BAND_KEYS,
  SCOPES,
  SORTS,
  type DrillFilters,
} from "@/modules/drills/filters";
import type { Taxonomy } from "@/modules/sports";
import { cn } from "@/lib/cn";
import { FilterForm } from "./filter-form";

/**
 * Filter controls for the library. A client component (the shared `Field` takes a render prop, which cannot
 * cross the server→client boundary); the option lists are small serialisable props from the server page.
 */
export function LibraryFilters({
  filters,
  taxonomy,
}: {
  filters: DrillFilters;
  taxonomy: Taxonomy;
}) {
  const t = useTranslations("drills");
  const any = t("filters.any");

  return (
    <FilterForm activeCount={activeFilterCount(filters)}>
      <Field label={t("filters.search")} className="min-w-0">
        {(c) => (
          <Input
            {...c}
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={t("filters.searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
          />
        )}
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">{t("filters.scope")}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-md border border-line-strong bg-surface-sunken p-1">
          {SCOPES.map((s) => (
            <label key={s} className="relative block cursor-pointer text-center">
              <input
                type="radio"
                name="scope"
                value={s}
                defaultChecked={filters.scope === s}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "block rounded-sm px-1 py-2 text-xs leading-tight font-medium text-ink-muted transition-colors",
                  "peer-checked:bg-surface-raised peer-checked:text-ink peer-checked:shadow-paper",
                  "peer-focus-visible:outline-focus peer-focus-visible:outline-2",
                )}
              >
                {t(`scopes.filter.${s}`)}
              </span>
            </label>
          ))}
        </div>
        <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
          <Checkbox name="favorites" value="1" defaultChecked={filters.favorites} />
          {t("filters.favorites")}
        </label>
      </fieldset>

      <Field label={t("filters.category")}>
        {(c) => (
          <Select {...c} name="category" defaultValue={filters.category ?? ""}>
            <option value="">{any}</option>
            {taxonomy.categories.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("filters.skill")}>
        {(c) => (
          <Select {...c} name="skill" defaultValue={filters.skill ?? ""}>
            <option value="">{any}</option>
            {/* a skill with sub-skills is a group: choosing the group's own entry matches all of its sub-skills too */}
            {taxonomy.skills
              .filter((x) => !x.parentKey)
              .map((x) => {
                const children = taxonomy.skills.filter((s) => s.parentKey === x.key);
                return children.length === 0 ? (
                  <option key={x.key} value={x.key}>
                    {x.name}
                  </option>
                ) : (
                  <optgroup key={x.key} label={x.name}>
                    <option value={x.key}>{t("filters.allOfSkill", { skill: x.name })}</option>
                    {children.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
          </Select>
        )}
      </Field>

      <Field label={t("filters.level")}>
        {(c) => (
          <Select {...c} name="level" defaultValue={filters.level ?? ""}>
            <option value="">{any}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`levels.${l}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("filters.intensity")}>
        {(c) => (
          <Select {...c} name="intensity" defaultValue={filters.intensity ?? ""}>
            <option value="">{any}</option>
            {INTENSITIES.map((i) => (
              <option key={i} value={i}>
                {t(`intensities.${i}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("filters.age")}>
          {(c) => (
            <Input
              {...c}
              type="number"
              name="age"
              inputMode="numeric"
              min={3}
              max={99}
              defaultValue={filters.age ?? ""}
              placeholder="—"
            />
          )}
        </Field>
        <Field label={t("filters.players")}>
          {(c) => (
            <Input
              {...c}
              type="number"
              name="players"
              inputMode="numeric"
              min={1}
              max={60}
              defaultValue={filters.players ?? ""}
              placeholder="—"
            />
          )}
        </Field>
      </div>

      <Field label={t("filters.duration")}>
        {(c) => (
          <Select {...c} name="duration" defaultValue={filters.duration ?? ""}>
            <option value="">{any}</option>
            {DURATION_BAND_KEYS.map((d) => (
              <option key={d} value={d}>
                {t(`durations.${d}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("filters.equipment")}>
        {(c) => (
          <Select {...c} name="equipment" defaultValue={filters.equipment ?? ""}>
            <option value="">{any}</option>
            {taxonomy.equipment.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("filters.phase")}>
        {(c) => (
          <Select {...c} name="phase" defaultValue={filters.phase ?? ""}>
            <option value="">{any}</option>
            {DRILL_PHASES.map((p) => (
              <option key={p} value={p}>
                {t(`phases.${p}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("filters.sort")}>
        {(c) => (
          <Select {...c} name="sort" defaultValue={filters.sort}>
            {SORTS.filter((s) => s !== "relevance" || filters.q).map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </FilterForm>
  );
}
