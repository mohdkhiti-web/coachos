import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/modules/identity";
import { listPlayers, listTeams } from "@/modules/roster";
import { MetaTag } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage() {
  const { actor } = await requireViewer();
  const [t, teams, unassigned] = await Promise.all([
    getTranslations("roster"),
    listTeams(actor),
    listPlayers(actor, { teamId: null }),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-2">
          <h1 className="display text-[2.6rem] text-ink md:text-5xl">{t("title")}</h1>
          <p className="max-w-2xl text-ink-muted">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/roster/new">{t("newTeam")}</Link>
        </Button>
      </header>

      {teams.length === 0 ? (
        <Card>
          <CardBody className="space-y-2 text-center">
            <p className="font-semibold text-ink">{t("empty.title")}</p>
            <p className="text-sm text-ink-muted">{t("empty.body")}</p>
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <li key={team.id}>
              <Card interactive className="h-full">
                <Link href={`/roster/${team.id}`} className="block h-full">
                  <CardHeader>
                    <p className="eyebrow">{team.sportName}</p>
                    <CardTitle>{team.name}</CardTitle>
                  </CardHeader>
                  <CardBody className="flex items-center justify-between">
                    <span className="text-sm text-ink-muted">
                      {t("playerCount", { count: team.playerCount })}
                    </span>
                    {team.status === "archived" ? (
                      <span className="rounded-xs border border-line px-2 py-0.5 text-xs text-ink-muted">
                        {t("archived")}
                      </span>
                    ) : null}
                  </CardBody>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("unassigned.title")}</CardTitle>
          <p className="text-sm text-ink-muted">{t("unassigned.description")}</p>
        </CardHeader>
        <CardBody>
          {unassigned.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("unassigned.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {unassigned.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium text-ink">{p.name}</span>
                  {p.classification !== null ? (
                    <span className="text-xs text-ink-muted">
                      {t("classification")} {p.classification.toFixed(1)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
