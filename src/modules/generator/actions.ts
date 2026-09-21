"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { RateWindow } from "@/lib/limits";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { isSportKey } from "@/sports/registry";
import { createGeneratedSession, previewGeneration, reviseGeneration } from "./commands";
import type { GenerationPreview } from "./dto";

/**
 * Server Actions of the session generator (Step 8): authenticate → rate-limit → command (authorize, validate against
 * the sport and the drills this person can read) → Result. The browser only ever sends a REQUEST (what the coach asked
 * for) and the ids of drills it was shown; everything else is decided, and checked again, here.
 */

const rate = new RateWindow(env.GENERATOR_RATE_PER_MINUTE, 60_000);

async function run<T>(
  scope: string,
  sportKey: string,
  command: (actor: Awaited<ReturnType<typeof requireViewer>>["actor"]) => Promise<Result<T>>,
): Promise<Result<T>> {
  const { actor } = await requireViewer();
  if (!isSportKey(sportKey)) return fail("NOT_FOUND");
  if (!rate.allow(actor.userId)) return fail("RATE_LIMITED");
  try {
    return await command(actor);
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error({ err: err instanceof Error ? err.message : String(err), scope }, "action.failed");
    return fail("INTERNAL");
  }
}

export async function previewGenerationAction(
  sportKey: string,
  requirements: unknown,
): Promise<Result<GenerationPreview>> {
  return run("generator.preview", sportKey, (a) => previewGeneration(a, sportKey, requirements));
}

export async function reviseGenerationAction(
  sportKey: string,
  requirements: unknown,
  items: unknown,
): Promise<Result<GenerationPreview>> {
  return run("generator.revise", sportKey, (a) =>
    reviseGeneration(a, sportKey, requirements, items),
  );
}

export async function createGeneratedSessionAction(
  sportKey: string,
  input: { requirements: unknown; items: unknown; extras?: Record<string, unknown> },
): Promise<Result<{ id: string; version: number; warnings: number }>> {
  const t = await getTranslations("generator.created");
  const result = await run("generator.create", sportKey, (a) =>
    createGeneratedSession(
      a,
      sportKey,
      input.requirements,
      input.items,
      typeof input.extras === "object" && input.extras !== null ? input.extras : {},
      {
        breakTitle: t("break"),
        title: (objective, minutes) => t("title", { objective, minutes }),
      },
    ),
  );
  if (result.ok) revalidatePath(`/sessions/${sportKey}`, "layout");
  return result;
}
