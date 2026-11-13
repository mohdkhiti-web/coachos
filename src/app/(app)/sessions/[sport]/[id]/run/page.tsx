import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunMode, type RunActivity } from "@/components/features/sessions/run-mode";
import { requireViewer } from "@/modules/identity";
import { getPlan, type PlanActivityDto } from "@/modules/plans";
import { getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "Run practice" };

/** The coaching points an activity carries: a library drill keeps them in its content, a custom one at the top. */
function pointsOf(a: PlanActivityDto): string[] {
  const s = a.snapshot;
  if (!s) return [];
  if ("content" in s) return s.content.coachingPoints;
  return s.coachingPoints ?? [];
}

/** Run mode: read-only, so anyone who may see the session may run it courtside. Nothing here writes. */
export default async function RunPracticePage({ params }: PageProps<"/sessions/[sport]/[id]/run">) {
  const { sport: key, id } = await params;
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  // row-level security: a session the viewer may not see is simply not there
  const plan = await getPlan(actor, sport.key, id);
  if (!plan) notFound();

  const activities: RunActivity[] = plan.activities.map((a) => {
    const first = a.snapshot?.diagrams?.[0] ?? null;
    return {
      id: a.id,
      title: a.title,
      isBreak: a.kind === "break",
      phase: a.phase,
      minutes: a.durationMin,
      points: pointsOf(a),
      diagram: first?.diagram ?? null,
      diagramTitle: first?.title ?? "",
    };
  });

  return (
    <RunMode
      title={plan.title}
      sessionHref={`/sessions/${sport.key}/${plan.id}`}
      activities={activities}
    />
  );
}
