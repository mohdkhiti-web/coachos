"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";
import { createShare, getShareStatus, regenerateShare, revokeShare } from "./commands";
import { SHARE_EXPIRIES, type ShareExpiry, type ShareStatusDto } from "./dto";

/**
 * Server Actions for sharing: authenticate → validate → command (authorize, transaction, audit) → Result. Each
 * re-authenticates: hiding a button is UX, not security.
 */

const expiry = (value: unknown): ShareExpiry | undefined =>
  value === null || value === undefined
    ? null
    : (SHARE_EXPIRIES as readonly unknown[]).includes(value)
      ? (value as ShareExpiry)
      : undefined;

async function run(
  scope: string,
  sportKey: string,
  planId: string,
  command: (
    actor: Awaited<ReturnType<typeof requireViewer>>["actor"],
  ) => Promise<Result<ShareStatusDto>>,
): Promise<Result<ShareStatusDto>> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey) || !isUuid(planId)) return fail("NOT_FOUND");
  try {
    const result = await command(actor);
    if (result.ok) revalidatePath(`/sessions/${sportKey}/${planId}/document`);
    return result;
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
    return fail("INTERNAL");
  }
}

export async function getShareAction(sportKey: string, planId: string) {
  return run("share.status", sportKey, planId, async (a) => ({
    ok: true as const,
    data: await getShareStatus(a, sportKey, planId),
  }));
}

export async function createShareAction(sportKey: string, planId: string, expiresInDays?: unknown) {
  const days = expiry(expiresInDays);
  if (days === undefined) return fail("VALIDATION", { fields: { expiresInDays: ["invalid"] } });
  return run("share.create", sportKey, planId, (a) => createShare(a, sportKey, planId, days));
}

export async function regenerateShareAction(
  sportKey: string,
  planId: string,
  expiresInDays?: unknown,
) {
  const days = expiry(expiresInDays);
  if (days === undefined) return fail("VALIDATION", { fields: { expiresInDays: ["invalid"] } });
  return run("share.regenerate", sportKey, planId, (a) =>
    regenerateShare(a, sportKey, planId, days),
  );
}

export async function revokeShareAction(sportKey: string, planId: string) {
  return run("share.revoke", sportKey, planId, (a) => revokeShare(a, sportKey, planId));
}
