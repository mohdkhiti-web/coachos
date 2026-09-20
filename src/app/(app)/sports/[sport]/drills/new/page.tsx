import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrillForm } from "@/components/features/drills/drill-form";
import { emptyValues } from "@/components/features/drills/form-model";
import { can } from "@/lib/authz/can";
import { requireViewer } from "@/modules/identity";
import { getSport, getTaxonomy } from "@/modules/sports";
import { getSportModule } from "@/sports/registry";

export const metadata: Metadata = { title: "New drill" };

export default async function NewDrillPage({ params }: PageProps<"/sports/[sport]/drills/new">) {
  const { sport: key } = await params;
  const viewer = await requireViewer();
  const sport = await getSport(key);
  const mod = sport ? getSportModule(sport.key) : undefined;
  if (!sport || !mod) notFound();
  // assistants read and run sessions but do not author; the server action enforces this again
  if (!can(viewer.actor, "drill:create", { organizationId: viewer.actor.organizationId }))
    redirect(`/sports/${sport.key}/drills`);

  const [t, taxonomy] = await Promise.all([getTranslations("drills.form"), getTaxonomy(sport.id)]);
  const base = `/sports/${sport.key}/drills`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="display text-4xl text-ink md:text-5xl">{t("createTitle")}</h2>
        <p className="max-w-2xl text-base text-ink-muted">{t("createSubtitle")}</p>
      </header>
      <DrillForm
        mode="create"
        sportKey={sport.key}
        categories={taxonomy.categories}
        skills={taxonomy.skills}
        equipment={taxonomy.equipment}
        spaces={[...mod.spaces]}
        showVisibility={viewer.organization.type !== "personal"}
        initial={emptyValues({
          space: mod.spaces[0]!,
          equipmentKeys: taxonomy.equipment.map((e) => e.key),
        })}
        cancelHref={base}
      />
    </div>
  );
}
