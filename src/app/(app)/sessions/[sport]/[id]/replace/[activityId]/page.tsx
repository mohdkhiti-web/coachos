import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrillPicker } from "@/components/features/sessions/drill-picker";
import { parseFilters, searchDrills } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getPlan } from "@/modules/plans";
import { getSport, getTaxonomy } from "@/modules/sports";
import { getSportModule } from "@/sports/registry";

export const metadata: Metadata = { title: "Replace a drill" };

/** Replace a drill: the same drill library search, aimed at ONE activity of the session. */
export default async function ReplaceDrillPage({
  params,
  searchParams,
}: PageProps<"/sessions/[sport]/[id]/replace/[activityId]">) {
  const [{ sport: key, id, activityId }, sp] = await Promise.all([params, searchParams]);
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  const plan = await getPlan(actor, sport.key, id);
  const activity = plan?.activities.find((a) => a.id === activityId);
  if (!plan || !activity || activity.kind !== "drill") notFound();
  const builder = `/sessions/${sport.key}/${plan.id}`;
  if (!plan.permissions.canEdit) redirect(builder);

  const filters = parseFilters(sp);
  const basePath = `${builder}/replace/${activity.id}`;
  const [t, result, taxonomy] = await Promise.all([
    getTranslations("sessions.picker"),
    searchDrills(actor, sport.key, filters),
    getTaxonomy(sport.id),
  ]);
  if (!result) notFound();

  return (
    <DrillPicker
      sportKey={sport.key}
      basePath={basePath}
      drillHref={(drillId) => `${basePath}/${drillId}`}
      backHref={builder}
      backLabel={t("back", { title: plan.title })}
      title={t("replaceTitle", { title: activity.title })}
      subtitle={t("replaceSubtitle")}
      addLabel={t("useThisDrill")}
      filters={filters}
      taxonomy={taxonomy}
      formats={getSportModule(sport.key)?.formats ?? []}
      result={result}
    />
  );
}
