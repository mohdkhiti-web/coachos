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

export const metadata: Metadata = { title: "Replace drill" };

/** Confirm a replacement. The activity keeps its slot, duration, players and notes; only the copied drill changes. */
export default async function ReplaceDrillDetailPage({
  params,
}: PageProps<"/sessions/[sport]/[id]/replace/[activityId]/[drillId]">) {
  const { sport: key, id, activityId, drillId } = await params;
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  const [plan, drill] = await Promise.all([
    getPlan(actor, sport.key, id),
    getDrill(actor, sport.key, drillId),
  ]);
  const activity = plan?.activities.find((a) => a.id === activityId);
  if (!plan || !activity || activity.kind !== "drill" || !drill || drill.status !== "published")
    notFound();
  const builder = `/sessions/${sport.key}/${plan.id}`;
  if (!plan.permissions.canEdit) redirect(builder);

  const t = await getTranslations("sessions.picker");
  const back = `${builder}/replace/${activity.id}`;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href={back}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("backToDrills")}
        </Link>
        <h1 className="display text-4xl text-ink md:text-5xl">{drill.title}</h1>
        <p className="max-w-2xl text-base text-ink-muted">
          {t("replaceConfirm", { current: activity.title })}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <DrillPreview drill={drill} fullHref={`/sports/${sport.key}/drills/${drill.id}`} />
        <div className="lg:sticky lg:top-24">
          <AddDrillForm
            sportKey={sport.key}
            planId={plan.id}
            version={plan.version}
            drillId={drill.id}
            mode={{ kind: "replace", activityId: activity.id }}
            defaults={{ durationMin: activity.durationMin, players: activity.players, phase: "" }}
            builderHref={builder}
            cancelHref={back}
          />
        </div>
      </div>
    </div>
  );
}
