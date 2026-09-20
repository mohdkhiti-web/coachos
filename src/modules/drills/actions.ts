"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";
import { archiveDrill, createDrill, duplicateDrill, setFavorite, updateDrill } from "./commands";
import { drillInputSchema } from "./validators";

/**
 * Server Actions for drills (ARCHITECTURE.md §18.2): authenticate → parse (Zod) → command (authorize,
 * validate against the sport, transaction + audit) → revalidate → Result. Each re-authenticates:
 * hiding a button is UX, not security. Payloads are plain JSON, so the whole form is validated on the
 * server exactly once, in one place.
 */

type Out = Result<{ id: string }>;

function unexpected(scope: string, err: unknown): Out {
  if (err instanceof AppError) return fail(err.code);
  logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
  return fail("INTERNAL");
}

function refresh(sport: string) {
  revalidatePath(`/sports/${sport}`, "layout"); // drops the client router cache for the workspace
}

function parse(raw: unknown) {
  const parsed = drillInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  // flatten to { "field.path": [message keys] } — nested paths keep their dots (e.g. "content.objective")
  const fields: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "form";
    (fields[path] ??= []).push(issue.message);
  }
  return { ok: false as const, error: fail("VALIDATION", { fields }) };
}

export async function createDrillAction(sportKey: string, raw: unknown): Promise<Out> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey)) return fail("NOT_FOUND");
  const input = parse(raw);
  if (!input.ok) return input.error;
  try {
    const result = await createDrill(actor, sportKey, input.data);
    if (result.ok) refresh(sportKey);
    return result;
  } catch (err) {
    return unexpected("drill.create", err);
  }
}

export async function updateDrillAction(sportKey: string, id: string, raw: unknown): Promise<Out> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !isUuid(id)) return fail("NOT_FOUND");
  const input = parse(raw);
  if (!input.ok) return input.error;
  try {
    const result = await updateDrill(actor, sportKey, id, input.data);
    if (result.ok) refresh(sportKey);
    return result;
  } catch (err) {
    return unexpected("drill.update", err);
  }
}

export async function archiveDrillAction(sportKey: string, id: string): Promise<Out> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !isUuid(id)) return fail("NOT_FOUND");
  try {
    const result = await archiveDrill(actor, sportKey, id);
    if (result.ok) refresh(sportKey);
    return result;
  } catch (err) {
    return unexpected("drill.archive", err);
  }
}

export async function duplicateDrillAction(sportKey: string, id: string): Promise<Out> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !isUuid(id)) return fail("NOT_FOUND");
  try {
    const result = await duplicateDrill(actor, sportKey, id);
    if (result.ok) refresh(sportKey);
    return result;
  } catch (err) {
    return unexpected("drill.duplicate", err);
  }
}

/** Star / un-star a drill. The caller states the wanted state (idempotent). Returns the resulting state. */
export async function setFavoriteAction(
  sportKey: string,
  id: string,
  favorite: boolean,
): Promise<Result<{ favorite: boolean }>> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !isUuid(id) || typeof favorite !== "boolean")
    return fail("NOT_FOUND");
  try {
    const result = await setFavorite(actor, sportKey, id, favorite);
    // the list, the Favorites view and the detail page all show the star: refresh the whole workspace
    if (result.ok) refresh(sportKey);
    return result;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), scope: "drill.favorite" },
      "action.failed",
    );
    return fail("INTERNAL");
  }
}
