import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrillForm } from "@/components/features/drills/drill-form";
import { valuesFromDrill } from "@/components/features/drills/form-model";
import { getDrill } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getSport, getTaxonomy } from "@/modules/sports";
import { getSportModule } from "@/sports/registry";

export const metadata: Metadata = { title: "Edit drill" };

export default async function EditDrillPage({
  params,
}: PageProps<"/sports/[sport]/drills/[id]/edit">) {
  const { sport: key, id } = await params;
  const viewer = await requireViewer();
  const sport = await getSport(key);
  const mod = sport ? getSportModule(sport.key) : undefined;
  if (!sport || !mod) notFound();

  const drill = await getDrill(viewer.actor, sport.key, id); // RLS: invisible drills don't exist here
  if (!drill) notFound();
  // Not editable by this user (library drills, colleagues' drills, archived): send them to the read view.
  // The Server Action checks again — this redirect is UX, not security.
  if (!drill.permissions.canEdit) redirect(`/sports/${sport.key}/drills/${drill.id}`);

  const [t, taxonomy] = await Promise.all([getTranslations("drills.form"), getTaxonomy(sport.id)]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="display text-4xl text-ink md:text-5xl">{t("editTitle")}</h2>
        <p className="max-w-2xl text-base text-ink-muted">{drill.title}</p>
      </header>
      <DrillForm
        mode="edit"
        sportKey={sport.key}
        categories={taxonomy.categories}
        skills={taxonomy.skills}
        equipment={taxonomy.equipment}
        spaces={[...mod.spaces]}
        showVisibility={viewer.organization.type !== "personal"}
        initial={valuesFromDrill(
          drill,
          taxonomy.equipment.map((e) => e.key),
        )}
        drillId={drill.id}
        version={drill.version}
        cancelHref={`/sports/${sport.key}/drills/${drill.id}`}
      />
    </div>
  );
}
