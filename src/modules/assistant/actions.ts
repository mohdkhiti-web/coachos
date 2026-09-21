"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { fail, type Result } from "@/lib/result";
import { requireViewer } from "@/modules/identity";
import { applyProposalInMessage, dismissProposalInMessage } from "./apply-message";
import type { MessageDto } from "./dto";
import { deleteConversation, getMessage } from "./store";
import { toMessageDto } from "./serialize";

/**
 * Server Actions of the assistant screen (Step 8): apply or dismiss a proposal, delete a conversation. Sending a message is a
 * streaming route (`/api/assistant/message`, so it can be cancelled). Each action authenticates, validates its input and goes
 * through the same commands as the rest of the app.
 */

const applySchema = z.strictObject({
  messageId: z.uuid(),
  proposalId: z.string().min(8).max(64),
  confirmed: z.boolean().default(false),
});

export async function applyProposalAction(
  raw: unknown,
): Promise<Result<{ planId: string | null; activityId?: string; message: MessageDto }>> {
  const { actor } = await requireViewer();
  const input = applySchema.safeParse(raw);
  if (!input.success) return fail("VALIDATION");
  const t = await getTranslations("generator.created");
  try {
    const result = await applyProposalInMessage(actor, input.data, {
      breakTitle: t("break"),
      title: (objective, minutes) => t("title", { objective, minutes }),
    });
    if (!result.ok) return result;
    const message = await getMessage(actor, input.data.messageId);
    revalidatePath("/sessions", "layout");
    return {
      ok: true,
      data: {
        planId: result.data.planId,
        activityId: result.data.activityId,
        message: toMessageDto(message!),
      },
    };
  } catch (err) {
    if (err instanceof AppError) return fail(err.code);
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "assistant.apply_failed",
    );
    return fail("INTERNAL");
  }
}

export async function dismissProposalAction(
  raw: unknown,
): Promise<Result<{ message: MessageDto }>> {
  const { actor } = await requireViewer();
  const input = applySchema.omit({ confirmed: true }).safeParse(raw);
  if (!input.success) return fail("VALIDATION");
  const result = await dismissProposalInMessage(actor, input.data);
  if (!result.ok) return result;
  const message = await getMessage(actor, input.data.messageId);
  return { ok: true, data: { message: toMessageDto(message!) } };
}

export async function deleteConversationAction(id: string): Promise<Result<void>> {
  const { actor } = await requireViewer();
  if (!isUuid(id)) return fail("NOT_FOUND");
  const done = await deleteConversation(actor, id);
  if (!done) return fail("NOT_FOUND");
  revalidatePath("/assistant", "layout");
  return { ok: true, data: undefined };
}
