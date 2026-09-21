import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { can } from "@/lib/authz/can";
import { requireViewer } from "@/modules/identity";
import { listPlans } from "@/modules/plans";
import { listActiveSports } from "@/modules/sports";
import { listTemplates } from "@/modules/templates";
import {
  activeTemplateFilterCount,
  parseTemplateFilters,
  TEMPLATE_PAGE_SIZE,
  templateHrefFor,
  type RawParams,
} from "@/modules/templates/filters";
import type { ApplyTarget } from "./apply-template-dialog";
import { TemplateFilters } from "./template-filters";
import { TemplateGrid } from "./template-grid";
import { TemplatePagination } from "./template-pagination";

/**
 * The Templates page. One view serves `/templates` (every sport) and `/templates/[sport]`: the sport is a filter, and
 * the chips above the list are links, so the choice is part of the address like every other filter.
 */
export async function TemplatesListView({
  sportKey,
  searchParams,
}: {
  sportKey?: string;
  searchParams: RawParams;
}) {
  const { actor, organization } = await requireViewer();
  const t = await getTranslations("templates");
  const sports = await listActiveSports();
  const sport = sportKey ? sports.find((s) => s.key === sportKey) : undefined;

  const filters = parseTemplateFilters(searchParams); // lenient: the URL is untrusted
  const basePath = sportKey ? `/templates/${sportKey}` : "/templates";
  const query = {
    sportKey,
    q: filters.q || undefined,
    category: filters.category,
    scope: filters.scope,
    status: filters.status,
    limit: TEMPLATE_PAGE_SIZE,
  };
  const first = await listTemplates(actor, {
    ...query,
    offset: (filters.page - 1) * TEMPLATE_PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(first.total / TEMPLATE_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  // a stale ?page=99 lands on the last page instead of an empty one
  const result =
    page === filters.page
      ? first
      : await listTemplates(actor, { ...query, offset: (page - 1) * TEMPLATE_PAGE_SIZE });

  const canCreate = can(actor, "template:create", { organizationId: actor.organizationId });
  const personal = organization.type === "personal";
  const filtered = activeTemplateFilterCount({ ...filters, status: undefined }) > 0;
  const from = result.total === 0 ? 0 : (page - 1) * TEMPLATE_PAGE_SIZE + 1;
  const to = Math.min(page * TEMPLATE_PAGE_SIZE, result.total);
  const newSport = sportKey ?? (sports.length === 1 ? sports[0]!.key : undefined);
  const newHref = newSport ? `/templates/${newSport}/new` : undefined;

  // the viewer's own live sessions, for "Apply to a session" (only authors can apply; the server checks again)
  const sessions: Record<string, ApplyTarget[]> = {};
  if (canCreate && result.items.some((x) => x.status === "active" && !x.deletedAt)) {
    const keys = [...new Set(result.items.map((x) => x.sportKey))];
    for (const key of keys) {
      const list = await listPlans(actor, key, {
        statuses: ["draft", "published"],
        mineOnly: true,
        limit: 30,
      });
      sessions[key] = (list?.items ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        version: s.version,
      }));
    }
  }

  const chip =
    "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow text-accent">{sport?.name ?? t("allSports")}</p>
          <h1 className="display text-5xl text-ink md:text-6xl">{t("title")}</h1>
          <p className="max-w-2xl text-base text-ink-muted">{t("subtitle")}</p>
        </div>
        {canCreate && newHref ? (
          <Button asChild size="lg">
            <Link href={newHref}>
              <Plus className="size-5" aria-hidden />
              {t("create")}
            </Link>
          </Button>
        ) : null}
      </header>

      <nav aria-label={t("sportFilter")}>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href={templateHrefFor("/templates", { ...filters, page: 1 })}
              aria-current={!sportKey ? "page" : undefined}
              className={cn(
                chip,
                !sportKey
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line-strong text-ink-muted hover:text-ink",
              )}
            >
              {t("allSports")}
            </Link>
          </li>
          {sports.map((s) => (
            <li key={s.key}>
              <Link
                href={templateHrefFor(`/templates/${s.key}`, { ...filters, page: 1 })}
                aria-current={sportKey === s.key ? "page" : undefined}
                className={cn(
                  chip,
                  sportKey === s.key
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line-strong text-ink-muted hover:text-ink",
                )}
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <aside aria-label={t("filters.region")} className="md:sticky md:top-24 md:self-start">
          <TemplateFilters filters={filters} showScope={!personal} />
        </aside>

        <section aria-labelledby="templates-heading" className="min-w-0 space-y-5">
          <h2 id="templates-heading" className="sr-only">
            {t("listHeading")}
          </h2>
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            {result.total === 0 ? (
              t("results.none")
            ) : pageCount === 1 ? (
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

          {result.items.length > 0 ? (
            <>
              <TemplateGrid items={result.items} sessions={sessions} canCreate={canCreate} />
              <TemplatePagination
                basePath={basePath}
                filters={filters}
                page={page}
                pageCount={pageCount}
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
                      <Link href={basePath}>{t("filters.clear")}</Link>
                    </Button>
                  }
                />
              ) : filters.status === "archived" ? (
                <EmptyState
                  title={t("empty.archivedTitle")}
                  description={t("empty.archivedBody")}
                />
              ) : filters.status === "deleted" ? (
                <EmptyState title={t("empty.deletedTitle")} description={t("empty.deletedBody")} />
              ) : (
                <EmptyState
                  title={t("empty.noneTitle")}
                  description={t("empty.noneBody")}
                  action={
                    canCreate && newHref ? (
                      <Button asChild size="lg">
                        <Link href={newHref}>
                          <Plus className="size-5" aria-hidden />
                          {t("create")}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
