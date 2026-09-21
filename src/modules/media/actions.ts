"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { deleteLogo, uploadLogo } from "./commands";
import type { LogoDto } from "./dto";
import { MAX_LOGO_BYTES } from "./image";

/**
 * Server Actions for logos: authenticate → command (authorize, inspect, store, audit) → Result. The browser sends a
 * `FormData` with one `file`; its declared name and type are never trusted (the bytes decide, see `inspectLogo`).
 */

export async function uploadLogoAction(form: FormData): Promise<Result<LogoDto>> {
  const { actor } = await requireViewer();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return fail("VALIDATION", { fields: { file: ["logo_empty"] } });
  if (file.size > MAX_LOGO_BYTES)
    return fail("VALIDATION", { fields: { file: ["logo_too_large"] } });
  try {
    const result = await uploadLogo(actor, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    if (result.ok) revalidatePath("/sessions", "layout");
    return result;
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "action.failed");
    return fail("INTERNAL");
  }
}

export async function deleteLogoAction(id: string): Promise<Result<{ id: string }>> {
  const { actor } = await requireViewer();
  if (!isUuid(id)) return fail("NOT_FOUND");
  try {
    return await deleteLogo(actor, id);
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "action.failed");
    return fail("INTERNAL");
  }
}
