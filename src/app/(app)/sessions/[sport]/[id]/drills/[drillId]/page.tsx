import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AddDrillForm } from "@/components/features/sessions/add-drill-form";
import { DrillPreview } from "@/components/features/sessions/drill-preview";
import { getDrill } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getPlan } from "@/modules/plans";
import { getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "Add drill to session" };

/** Step 2: look inside the drill, set its duration, players, repetitions and notes, and add it. The library drill is only read. */
export default async function AddDrillDetailPage({
  params,
}: PageProps<"/sessions/[sport]/[id]/drills/[drillId]">) {
  const { sport: key, id, drillId } = await params;
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  const [plan, drill] = await Promise.all([
    getPlan(actor, sport.key, id),
    getDrill(actor, sport.key, drillId), // RLS: a drill the viewer may not read is simply not there
  ]);
  if (!plan || !drill || drill.status !== "published") notFound();
  const builder = `/sessions/${sport.key}/${plan.id}`;
  if (!plan.permissions.canEdit) redirect(builder);

  const t = await getTranslations("sessions.picker");
  // suggestions from the drill: the middle of its duration range; players near the session's, within the drill's range
  const players = plan.players
    ? Math.min(Math.max(plan.players, drill.playersMin), drill.playersMax)
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href={`${builder}/drills`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("backToDrills")}
        </Link>
        <h1 className="display text-4xl text-ink md:text-5xl">{drill.title}</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <DrillPreview drill={drill} fullHref={`/sports/${sport.key}/drills/${drill.id}`} />
        <div className="lg:sticky lg:top-24">
          <AddDrillForm
            sportKey={sport.key}
            planId={plan.id}
            version={plan.version}
            drillId={drill.id}
            mode={{ kind: "add" }}
            defaults={{
              durationMin: Math.round((drill.durationMin + drill.durationMax) / 2),
              players,
              phase: drill.phases[0] ?? "",
            }}
            builderHref={builder}
            cancelHref={`${builder}/drills`}
          />
        </div>
      </div>
    </div>
  );
}
