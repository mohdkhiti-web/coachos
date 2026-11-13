import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerRow } from "@/components/features/roster/player-row";
import { TeamHeader } from "@/components/features/roster/team-header";
import {
  AgeProfile,
  ClassificationProfile,
  TeamStats,
  TeamTraining,
} from "@/components/features/roster/team-insights";
import { TallyMarks } from "@/components/features/roster/team-sheet";
import { todayIn } from "@/lib/calendar";
import { requireViewer } from "@/modules/identity";
import {
  ageOn,
  getTeam,
  listPlayers,
  listTeams,
  rosterSessions,
  squadProfile,
  teamPulse,
} from "@/modules/roster";

export const metadata: Metadata = { title: "Team" };

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const { actor } = viewer;
  const team = await getTeam(actor, id);
  if (!team) notFound();
  const today = todayIn(viewer.profile.timezone);

  const [t, players, allTeams, sessions] = await Promise.all([
    getTranslations("roster"),
    listPlayers(actor, { teamId: id }),
    listTeams(actor),
    rosterSessions(actor, [team.sportKey], today),
  ]);
  const teamOptions = allTeams.map((tm) => ({ id: tm.id, name: tm.name }));
  const squad = squadProfile(players, today);
  const pulse = teamPulse(team.name, sessions, today);
  const sheet = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <p>
        <Link href="/roster" className="text-sm text-ink-muted hover:text-ink">
          {t("backToRoster")}
        </Link>
      </p>

      <TeamHeader team={team} />
      <TeamStats team={team} pulse={pulse} squad={squad} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle>{t("players")}</CardTitle>
              <TallyMarks count={players.length} className="text-ink" />
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/roster/${team.id}/players/new`}>
                <UserPlus className="size-4" aria-hidden />
                {t("addPlayer")}
              </Link>
            </Button>
          </CardHeader>
          <CardBody>
            {sheet.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noPlayers")}</p>
            ) : (
              <ul className="divide-y divide-line" aria-label={t("squadList", { name: team.name })}>
                {sheet.map((p, i) => (
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

        <Card>
          <CardBody className="space-y-8 divide-line pt-6 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-6">
            <TeamTraining team={team} pulse={pulse} />
            <AgeProfile squad={squad} total={players.length} />
            <ClassificationProfile squad={squad} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
