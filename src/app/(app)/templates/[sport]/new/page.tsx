import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadSampleInput } from "@/components/features/templates/sample-input";
import { TemplateEditor } from "@/components/features/templates/template-editor";
import { can } from "@/lib/authz/can";
import { requireViewer } from "@/modules/identity";
import { getSport } from "@/modules/sports";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage({ params }: PageProps<"/templates/[sport]/new">) {
  const { sport: key } = await params;
  const { actor, organization, user } = await requireViewer();
  const sport = await getSport(key);
  if (!sport) notFound();
  // assistants read and use templates but do not author; the server action enforces this again
  if (!can(actor, "template:create", { organizationId: actor.organizationId }))
    redirect(`/templates/${sport.key}`);

  return (
    <TemplateEditor
      mode="create"
      sportKey={sport.key}
      sportName={sport.name}
      template={null}
      sample={await loadSampleInput(actor, sport.key, user.name)}
      personal={organization.type === "personal"}
      readOnly={null}
      initialView="design"
    />
  );
}
