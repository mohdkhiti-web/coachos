import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrillPicker } from "@/components/features/sessions/drill-picker";
import { parseFilters, searchDrills } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getPlan } from "@/modules/plans";
import { getSport, getTaxonomy } from "@/modules/sports";
import { getSportModule } from "@/sports/registry";

export const metadata: Metadata = { title: "Add a drill" };

/** Step 1 of adding a drill: search and filter the drill library (the library's own search), then pick one. */
export default async function AddDrillPage({
  params,
  searchParams,
}: PageProps<"/sessions/[sport]/[id]/drills">) {
  const [{ sport: key, id }, sp] = await Promise.all([params, searchParams]);
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  const plan = await getPlan(actor, sport.key, id);
  if (!plan) notFound();
  const builder = `/sessions/${sport.key}/${plan.id}`;
  if (!plan.permissions.canEdit) redirect(builder); // read-only sessions cannot take new drills

  const filters = parseFilters(sp); // lenient: the URL is untrusted
  const basePath = `${builder}/drills`;
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
      title={t("addTitle")}
      subtitle={t("addSubtitle", { title: plan.title })}
      addLabel={t("addToSession")}
      filters={filters}
      taxonomy={taxonomy}
      formats={getSportModule(sport.key)?.formats ?? []}
      result={result}
    />
  );
}
