import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Plus, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SessionCard } from "@/components/features/sessions/session-card";
import { SessionFilters } from "@/components/features/sessions/session-filters";
import { SessionPagination } from "@/components/features/sessions/session-pagination";
import { SessionStatusTabs } from "@/components/features/sessions/session-status-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/authz/can";
import { assistantAvailability } from "@/modules/assistant";
import { requireViewer } from "@/modules/identity";
import {
  activePlanFilterCount,
  listPlans,
  listPlanTeams,
  PLAN_PAGE_SIZE,
  parsePlanFilters,
  planHrefFor,
  statusesFor,
} from "@/modules/plans";
import { getAgeGroups, getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "My Sessions" };

export default async function MySessionsPage({
  params,
  searchParams,
}: PageProps<"/sessions/[sport]">) {
  const [{ sport: key }, sp] = await Promise.all([params, searchParams]);
  const { actor, profile } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();

  const filters = parsePlanFilters(sp); // lenient: the URL is untrusted
  const basePath = `/sessions/${sport.key}`;
  const { statuses, trash } = statusesFor(filters.status);
  const query = {
    statuses,
    trash,
    q: filters.q || undefined,
    ageGroup: filters.age,
    team: filters.team,
    from: filters.from,
    to: filters.to,
    limit: PLAN_PAGE_SIZE,
  };

  const [t, first, teams, ageGroups] = await Promise.all([
    getTranslations("sessions"),
    listPlans(actor, sport.key, { ...query, offset: (filters.page - 1) * PLAN_PAGE_SIZE }),
    listPlanTeams(actor, sport.key),
    getAgeGroups(sport.id),
  ]);
  if (!first) notFound();
  const pageCount = Math.max(1, Math.ceil(first.total / PLAN_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  // a stale ?page=99 lands on the last page instead of an empty one
  const result =
    page === filters.page
      ? first
      : ((await listPlans(actor, sport.key, { ...query, offset: (page - 1) * PLAN_PAGE_SIZE })) ??
        first);

  // narrowing filters only: choosing the Archived or Deleted view is not a search that found nothing
  const filtered = activePlanFilterCount({ ...filters, status: undefined }) > 0;
  const canCreate = can(actor, "plan:create", { organizationId: actor.organizationId });
  const timeZone = profile.timezone ?? "UTC";
  const from = result.total === 0 ? 0 : (page - 1) * PLAN_PAGE_SIZE + 1;
  const to = Math.min(page * PLAN_PAGE_SIZE, result.total);
  const createHref = `${basePath}/new`;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow text-accent">{sport.name}</p>
          <h1 className="display text-5xl text-ink md:text-6xl">{t("title")}</h1>
        </div>
        {canCreate ? (
          <div className="flex flex-wrap items-center gap-3">
            {assistantAvailability().available ? (
              <Button asChild size="lg" variant="secondary">
                <Link
                  href={`/assistant/${sport.key}?prompt=${encodeURIComponent(t("createWithAiPrompt"))}`}
                >
                  <Bot className="size-5" aria-hidden />
                  {t("createWithAi")}
                </Link>
              </Button>
            ) : null}
            <Button asChild size="lg" variant="secondary">
              <Link href={`${basePath}/generate`}>
                <Sparkles className="size-5" aria-hidden />
                {t("generate")}
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href={createHref}>
                <Plus className="size-5" aria-hidden />
                {t("create")}
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <aside aria-label={t("filters.region")} className="md:sticky md:top-24 md:self-start">
          <SessionFilters
            filters={filters}
            ageGroups={ageGroups.map((g) => ({ key: g.key, name: g.name }))}
            teams={teams}
          />
        </aside>

        <section aria-labelledby="sessions-heading" className="min-w-0 space-y-5">
          <h2 id="sessions-heading" className="sr-only">
            {t("listHeading")}
          </h2>
          <SessionStatusTabs basePath={basePath} filters={filters} />
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
              <ul className="space-y-4">
                {result.items.map((s) => (
                  <li key={s.id}>
                    <SessionCard session={s} sportKey={sport.key} timeZone={timeZone} />
                  </li>
                ))}
              </ul>
              <SessionPagination
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
                      <Link href={planHrefFor(basePath, {})}>{t("filters.clear")}</Link>
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
                    canCreate ? (
                      <Button asChild size="lg">
                        <Link href={createHref}>
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
