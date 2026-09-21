"use server";

import { revalidatePath } from "next/cache";
import { TEMPLATE_STATUSES, type TemplateStatus } from "@/db/enums";
import type { Actor } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";
import type { ZodType } from "zod";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  restoreTemplate,
  setTemplateStatus,
  updateTemplate,
} from "./commands";
import { templateInputSchema } from "./validators";

/**
 * Server Actions for templates (ARCHITECTURE.md §18.2): authenticate → parse (Zod) → command (authorize, validate,
 * transaction + audit) → revalidate → Result. Each re-authenticates: hiding a button is UX, not security.
 */

type Done = Result<{ id: string; version: number }>;

function refresh() {
  revalidatePath("/templates", "layout"); // drops the client router cache for the templates area
}

function parse<T>(
  schema: ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; error: Result<never> } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "form";
    (fields[path] ??= []).push(issue.message);
  }
  return { ok: false, error: fail("VALIDATION", { fields }) };
}

async function run<T>(
  scope: string,
  sportKey: string,
  ids: string[],
  command: (actor: Actor) => Promise<Result<T>>,
): Promise<Result<T>> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !ids.every(isUuid)) return fail("NOT_FOUND");
  try {
    const result = await command(actor);
    if (result.ok) refresh();
    return result;
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
    return fail("INTERNAL");
  }
}

export async function createTemplateAction(sportKey: string, raw: unknown): Promise<Done> {
  const input = parse(templateInputSchema, raw);
  if (!input.ok) return input.error;
  return run("template.create", sportKey, [], (a) => createTemplate(a, sportKey, input.data));
}

export async function updateTemplateAction(
  sportKey: string,
  id: string,
  raw: unknown,
): Promise<Done> {
  const input = parse(templateInputSchema, raw);
  if (!input.ok) return input.error;
  return run("template.update", sportKey, [id], (a) => updateTemplate(a, sportKey, id, input.data));
}

export async function duplicateTemplateAction(sportKey: string, id: string): Promise<Done> {
  return run("template.duplicate", sportKey, [id], (a) => duplicateTemplate(a, sportKey, id));
}

export async function setTemplateStatusAction(
  sportKey: string,
  id: string,
  status: TemplateStatus,
  version: number,
): Promise<Done> {
  if (!(TEMPLATE_STATUSES as readonly string[]).includes(status) || !Number.isInteger(version))
    return fail("VALIDATION");
  return run("template.status", sportKey, [id], (a) =>
    setTemplateStatus(a, sportKey, id, status, version),
  );
}

export async function deleteTemplateAction(sportKey: string, id: string): Promise<Done> {
  return run("template.delete", sportKey, [id], (a) => deleteTemplate(a, sportKey, id));
}

export async function restoreTemplateAction(sportKey: string, id: string): Promise<Done> {
  return run("template.restore", sportKey, [id], (a) => restoreTemplate(a, sportKey, id));
}
