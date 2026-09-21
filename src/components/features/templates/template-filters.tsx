"use client";

import { useTranslations } from "next-intl";
import { FilterForm } from "@/components/features/drills/filter-form";
import { Field, Input, Select } from "@/components/ui/field";
import { TEMPLATE_CATEGORIES } from "@/db/enums";
import {
  activeTemplateFilterCount,
  TEMPLATE_SCOPES,
  TEMPLATE_STATUS_FILTERS,
  type TemplateFilters as Filters,
} from "@/modules/templates/filters";

/**
 * Search and filters for the Templates page: search, category, whose (personal / shared with the workspace) and
 * status. The same enhanced GET form as the drill library and My Sessions: works without JavaScript, results update in
 * place, and every filtered view is a shareable link.
 */
export function TemplateFilters({
  filters,
  showScope,
}: {
  filters: Filters;
  /** A personal workspace has only the viewer's own templates, so "whose" is not a question there. */
  showScope: boolean;
}) {
  const t = useTranslations("templates.filters");
  const tcat = useTranslations("templates.categories");
  const tscope = useTranslations("templates.scope");
  const tstatus = useTranslations("templates.status");

  return (
    <FilterForm activeCount={activeTemplateFilterCount(filters)}>
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
      <Field label={t("category")}>
        {(c) => (
          <Select {...c} name="category" defaultValue={filters.category ?? ""}>
            <option value="">{t("categoryAny")}</option>
            {TEMPLATE_CATEGORIES.map((k) => (
              <option key={k} value={k}>
                {tcat(k)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {showScope ? (
        <Field label={t("scope")}>
          {(c) => (
            <Select {...c} name="scope" defaultValue={filters.scope ?? ""}>
              <option value="">{t("scopeAny")}</option>
              {TEMPLATE_SCOPES.map((k) => (
                <option key={k} value={k}>
                  {tscope(k)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field label={t("status")}>
        {(c) => (
          <Select {...c} name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("statusActive")}</option>
            {TEMPLATE_STATUS_FILTERS.map((k) => (
              <option key={k} value={k}>
                {tstatus(k)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </FilterForm>
  );
}
