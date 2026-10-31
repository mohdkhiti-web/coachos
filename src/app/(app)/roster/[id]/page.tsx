import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerRow } from "@/components/features/roster/player-row";
import { TeamHeader } from "@/components/features/roster/team-header";
import { requireViewer } from "@/modules/identity";
import { getTeam, listPlayers, listTeams } from "@/modules/roster";

export const metadata: Metadata = { title: "Team" };

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireViewer();
  const team = await getTeam(actor, id);
  if (!team) notFound();

  const [t, players, allTeams] = await Promise.all([
    getTranslations("roster"),
    listPlayers(actor, { teamId: id }),
    listTeams(actor),
  ]);
  const teamOptions = allTeams.map((tm) => ({ id: tm.id, name: tm.name }));

  return (
    <div className="space-y-8">
      <p>
        <Link href="/roster" className="text-sm text-ink-muted hover:text-ink">
          {t("backToRoster")}
        </Link>
      </p>

      <TeamHeader team={team} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("players")}</CardTitle>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/roster/${team.id}/players/new`}>{t("addPlayer")}</Link>
          </Button>
        </CardHeader>
        <CardBody>
          {players.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noPlayers")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {players.map((p) => (
                <PlayerRow key={p.id} player={p} teams={teamOptions} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
