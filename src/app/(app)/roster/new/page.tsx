import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamForm } from "@/components/features/roster/team-form";
import { requireViewer } from "@/modules/identity";
import { cookies } from "next/headers";
import { parseSportPref, SPORT_COOKIE } from "@/lib/sport-pref";
import { listActiveSports } from "@/modules/sports";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "New team" };

export default async function NewTeamPage() {
  await requireViewer();
  const [t, sports, cookieStore] = await Promise.all([
    getTranslations("roster"),
    listActiveSports(),
    cookies(),
  ]);
  const current = parseSportPref(cookieStore.get(SPORT_COOKIE)?.value) ?? PRIMARY_SPORT_KEY;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="display text-3xl text-ink">{t("newTeam")}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
        </CardHeader>
        <TeamForm
          sports={sports.map((s) => ({ key: s.key, name: s.name }))}
          defaultSport={sports.some((s) => s.key === current) ? current : undefined}
        />
      </Card>
    </div>
  );
}
