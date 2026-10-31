import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamForm } from "@/components/features/roster/team-form";
import { requireViewer } from "@/modules/identity";
import { listActiveSports } from "@/modules/sports";

export const metadata: Metadata = { title: "New team" };

export default async function NewTeamPage() {
  await requireViewer();
  const [t, sports] = await Promise.all([getTranslations("roster"), listActiveSports()]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="display text-3xl text-ink">{t("newTeam")}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
        </CardHeader>
        <TeamForm sports={sports.map((s) => ({ key: s.key, name: s.name }))} />
      </Card>
    </div>
  );
}
