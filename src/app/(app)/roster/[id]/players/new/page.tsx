import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerForm } from "@/components/features/roster/player-form";
import { requireViewer } from "@/modules/identity";
import { getTeam, listTeams } from "@/modules/roster";

export const metadata: Metadata = { title: "Add player" };

export default async function NewPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireViewer();
  const team = await getTeam(actor, id);
  if (!team) notFound();

  const [t, allTeams] = await Promise.all([getTranslations("roster"), listTeams(actor)]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p>
        <Link href={`/roster/${team.id}`} className="text-sm text-ink-muted hover:text-ink">
          {t("backToTeam", { name: team.name })}
        </Link>
      </p>
      <header className="space-y-1">
        <h1 className="display text-3xl text-ink">{t("addPlayer")}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
        </CardHeader>
        <PlayerForm
          teams={allTeams.map((tm) => ({ id: tm.id, name: tm.name }))}
          defaultTeamId={team.id}
        />
      </Card>
    </div>
  );
}
