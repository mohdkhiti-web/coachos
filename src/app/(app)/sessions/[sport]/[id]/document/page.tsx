import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentWorkspace } from "@/components/features/document/document-workspace";
import { can } from "@/lib/authz/can";
import { resolveSessionDesign } from "@/modules/documents";
import { requireViewer } from "@/modules/identity";
import { getPlan, toDocumentInput } from "@/modules/plans";
import { getSport } from "@/modules/sports";
import { listTemplateChoices } from "@/modules/templates";

export const metadata: Metadata = { title: "Session design" };

export default async function SessionDocumentPage({
  params,
  searchParams,
}: PageProps<"/sessions/[sport]/[id]/document">) {
  const { sport: key, id } = await params;
  const { view } = await searchParams;
  const { actor, organization } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  // row-level security: a session the viewer may not see is simply not there
  const plan = await getPlan(actor, sport.key, id);
  if (!plan) notFound();

  const settings = plan.documentSettings;
  const { preset, reflection } = settings;
  // Preset → the template this session was based on (frozen when applied) → this session's own changes
  const design = resolveSessionDesign(settings);
  const templates = await listTemplateChoices(actor, sport.key);

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
      templateLink={plan.template}
      templateLayer={settings.template?.design ?? null}
      templates={templates}
      canCreateTemplate={can(actor, "template:create", { organizationId: actor.organizationId })}
      personalWorkspace={organization.type === "personal"}
    />
  );
}
