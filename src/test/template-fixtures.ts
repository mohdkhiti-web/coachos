import { documentTemplates } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { presetDesign } from "@/modules/documents";
import { createTemplate } from "@/modules/templates/commands";
import {
  templateInputSchema,
  type TemplateInput,
  type TemplateInputRaw,
} from "@/modules/templates/validators";

/** A valid template input: a name, and the classic design unless a look is given. */
export function templateInput(over: Partial<TemplateInputRaw> = {}): TemplateInput {
  return templateInputSchema.parse({
    name: "Friday sheet",
    preset: "classic",
    design: presetDesign("classic"),
    ...over,
  });
}

/** Create a template through the command (the normal path) and return its id + version, or throw. */
export async function makeTemplate(
  actor: Actor,
  over: Partial<TemplateInputRaw> = {},
): Promise<{ id: string; version: number }> {
  const r = await createTemplate(actor, "basketball", templateInput(over));
  if (!r.ok) throw new Error(`template fixture failed: ${JSON.stringify(r)}`);
  return r.data;
}

/** A stored config as the application writes it. */
export const bareConfig = (design: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  preset: "classic",
  design,
});

/** Insert a template row directly, as `actor`, through row-level security: no application code in between. */
export async function rawTemplate(
  actor: Actor,
  sportId: string,
  over: Partial<typeof documentTemplates.$inferInsert> = {},
): Promise<string> {
  const id = over.id ?? newId();
  await tenantTx(actor, (tx) =>
    tx.insert(documentTemplates).values({
      id,
      organizationId: actor.organizationId,
      sportId,
      createdBy: actor.userId,
      name: "Raw template",
      config: bareConfig(),
      ...over,
    }),
  );
  return id;
}
