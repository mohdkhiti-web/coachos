import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { toBuilderPlan } from "@/components/features/sessions/builder-model";
import { SessionBuilder } from "@/components/features/sessions/session-builder";
import { valuesFromPlan } from "@/components/features/sessions/session-model";
import { listTimezones } from "@/lib/timezones";
import { assistantAvailability } from "@/modules/assistant";
import { requireViewer } from "@/modules/identity";
import { getPlan } from "@/modules/plans";
import { getAgeGroups, getObjectives, getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "Session" };

export default async function SessionBuilderPage({ params }: PageProps<"/sessions/[sport]/[id]">) {
  const { sport: key, id } = await params;
  const { actor, organization } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  // row-level security: a session the viewer may not see (another workspace, someone's private one) is simply not there
  const plan = await getPlan(actor, sport.key, id);
  if (!plan) notFound();

  const [t, ageGroups, objectives] = await Promise.all([
    getTranslations("sessions"),
    getAgeGroups(sport.id),
    getObjectives(sport.id),
  ]);

  return (
    <SessionBuilder
      sportKey={sport.key}
      plan={toBuilderPlan(plan)}
      initialValues={valuesFromPlan(plan)}
      catalog={{
        ageGroups: ageGroups.map((g) => ({
          key: g.key,
          name: g.name,
          ageMin: g.ageMin,
          ageMax: g.ageMax,
        })),
        objectives: objectives.map((o) => ({ key: o.key, name: o.name })),
        timezones: listTimezones(),
      }}
      showVisibility={organization.type !== "personal"}
      backLabel={t("title")}
      assistantHref={
        assistantAvailability().available ? `/assistant/${sport.key}?plan=${plan.id}` : null
      }
    />
  );
}
