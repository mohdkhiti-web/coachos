import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PlayerRow } from "@/components/features/roster/player-row";
import { TeamSheetCard } from "@/components/features/roster/team-sheet";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/calendar";
import { requireViewer } from "@/modules/identity";
import {
  ageOn,
  listPlayers,
  listTeams,
  rosterSessions,
  squadProfile,
  teamPulse,
} from "@/modules/roster";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage() {
  const viewer = await requireViewer();
  const { actor } = viewer;
  const today = todayIn(viewer.profile.timezone);
  const [t, teams, everyone] = await Promise.all([
    getTranslations("roster"),
    listTeams(actor),
    listPlayers(actor),
  ]);
  const unassigned = everyone.filter((p) => p.teamId === null);
  const sessions = await rosterSessions(
    actor,
    teams.map((tm) => tm.sportKey),
    today,
  );
  const sheets = teams.map((team) => ({
    team,
    pulse: teamPulse(team.name, sessions, today),
    squad: squadProfile(
      everyone.filter((p) => p.teamId === team.id),
      today,
    ),
  }));
  const teamOptions = teams.map((tm) => ({ id: tm.id, name: tm.name }));
  const active = teams.filter((tm) => tm.status === "active").length;
  const figures = [
    { label: t("figures.teams"), value: active },
    { label: t("figures.players"), value: everyone.length },
    { label: t("figures.unassigned"), value: unassigned.length },
    {
      label: t("figures.sessions28"),
      value: sheets.reduce((n, s) => n + s.pulse.sessions28, 0),
    },
  ];
  const byName = [...unassigned].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-2">
          <h1 className="display text-[2.6rem] text-ink md:text-5xl">{t("title")}</h1>
          <p className="max-w-2xl text-ink-muted">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/roster/new">
            <Plus className="size-4" aria-hidden />
            {t("newTeam")}
          </Link>
        </Button>
      </header>

      {teams.length === 0 ? (
        <Card>
          <EmptyState
            scene="planning"
            title={t("empty.title")}
            description={t("empty.body")}
            action={
              <Button asChild>
                <Link href="/roster/new">{t("newTeam")}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <dl
            aria-label={t("figures.label")}
            className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper sm:grid-cols-4"
          >
            {figures.map((f, i) => (
              <div
                key={f.label}
                className={cn(
                  "animate-fade-up px-5 py-4",
                  i > 0 && "sm:border-l sm:border-line",
                  i % 2 === 1 && "max-sm:border-l max-sm:border-line",
                  i > 1 && "max-sm:border-t max-sm:border-line",
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <dd className="display numeral text-4xl leading-none text-ink">{f.value}</dd>
                <dt className="mt-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                  {f.label}
                </dt>
              </div>
            ))}
          </dl>

          <ul className="grid stagger-in gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {sheets.map((s, i) => (
              <li
                key={s.team.id}
                className="animate-fade-up"
                style={{ animationDelay: `${120 + i * 70}ms` }}
              >
                <TeamSheetCard team={s.team} pulse={s.pulse} squad={s.squad} index={i} />
              </li>
            ))}
          </ul>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("unassigned.title")}</CardTitle>
          <p className="text-sm text-ink-muted">{t("unassigned.description")}</p>
        </CardHeader>
        <CardBody>
          {byName.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("unassigned.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {byName.map((p, i) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  teams={teamOptions}
                  number={i + 1}
                  age={p.dateOfBirth ? ageOn(p.dateOfBirth, today) : null}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
