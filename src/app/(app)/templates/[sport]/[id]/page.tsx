import type { Metadata } from "next";
import { can } from "@/lib/authz/can";
import { notFound } from "next/navigation";
import { loadSampleInput } from "@/components/features/templates/sample-input";
import { TemplateEditor } from "@/components/features/templates/template-editor";
import { requireViewer } from "@/modules/identity";
import { listLogos } from "@/modules/media";
import { getSport } from "@/modules/sports";
import { getTemplate } from "@/modules/templates";

export const metadata: Metadata = { title: "Template" };

export default async function TemplatePage({
  params,
  searchParams,
}: PageProps<"/templates/[sport]/[id]">) {
  const [{ sport: key, id }, { view }] = await Promise.all([params, searchParams]);
  const { actor, organization, user } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  // row-level security: a template the viewer may not see (another workspace, someone's private one) is simply not there
  const template = await getTemplate(actor, id, { sportKey: sport.key });
  if (!template) notFound();

  return (
    <TemplateEditor
      mode="edit"
      sportKey={sport.key}
      sportName={sport.name}
      template={template}
      sample={await loadSampleInput(actor, sport.key, user.name)}
      personal={organization.type === "personal"}
      readOnly={
        template.permissions.canEdit
          ? null
          : template.status === "archived"
            ? "archived"
            : "readOnly"
      }
      logos={await listLogos(actor)}
      canUploadLogo={can(actor, "logo:create", { organizationId: actor.organizationId })}
      initialView={view === "preview" ? "preview" : "design"}
    />
  );
}
