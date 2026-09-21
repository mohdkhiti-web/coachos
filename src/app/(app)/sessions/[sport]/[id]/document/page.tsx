import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentWorkspace } from "@/components/features/document/document-workspace";
import { resolveDesign } from "@/modules/documents";
import { requireViewer } from "@/modules/identity";
import { getPlan, toDocumentInput } from "@/modules/plans";
import { getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "Session design" };

export default async function SessionDocumentPage({
  params,
  searchParams,
}: PageProps<"/sessions/[sport]/[id]/document">) {
  const { sport: key, id } = await params;
  const { view } = await searchParams;
  const { actor } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  // row-level security: a session the viewer may not see is simply not there
  const plan = await getPlan(actor, sport.key, id);
  if (!plan) notFound();

  const { preset, overrides, reflection } = plan.documentSettings;
  // Preset → (Template, none yet) → this session's own changes
  const design = resolveDesign({ preset, override: overrides });

  return (
    <DocumentWorkspace
      sportKey={sport.key}
      planId={plan.id}
      title={plan.title}
      version={plan.version}
      input={toDocumentInput(plan)}
      initial={{ preset, design, reflection }}
      canSave={plan.permissions.canEdit}
      readOnlyReason={
        plan.permissions.canEdit ? null : plan.status === "archived" ? "archived" : "readOnly"
      }
      initialView={view === "preview" ? "preview" : "design"}
    />
  );
}
