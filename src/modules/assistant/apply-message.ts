import "server-only";
import { eq } from "drizzle-orm";
import { assistantMessages } from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { isUuid } from "@/lib/ids";
import { fail, ok, type Result } from "@/lib/result";
import type { GenerationLabels } from "@/modules/generator";
import { applyProposal, type ApplyResult } from "./apply";
import { messageContentSchema, type MessageContent, type Proposal } from "./proposals";
import { getConversation, getMessage } from "./store";

/**
 * Applying or dismissing a proposal that lives in a stored message. A proposal is CLAIMED first (pending → applying, under a
 * row lock), so a double click or two open tabs can never apply it twice; then it is applied through the normal commands, and
 * the outcome — applied, or failed with a reason — is written back into the message so the chat always tells the truth.
 */

const CLAIM_TTL_MS = 60_000;

type Claimed = { proposal: Proposal; sportKey: string };

async function claim(
  actor: Actor,
  messageId: string,
  proposalId: string,
): Promise<Result<Claimed>> {
  // row-level security: only the person's own messages and conversations exist for this read
  const message = await getMessage(actor, messageId);
  const conversation = message ? await getConversation(actor, message.conversationId) : null;
  if (!message || !conversation) return fail("NOT_FOUND");
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.id, messageId))
      .for("update")
      .limit(1);
    if (!row || row.role !== "assistant") return fail("NOT_FOUND");
    const parsed = messageContentSchema.safeParse(row.content);
    if (!parsed.success) return fail("NOT_FOUND");
    const content = parsed.data;
    const proposal = content.proposals.find((p) => p.id === proposalId);
    if (!proposal) return fail("NOT_FOUND");
    const stale =
      proposal.status === "applying" &&
      (!proposal.claimedAt || Date.now() - Date.parse(proposal.claimedAt) > CLAIM_TTL_MS);
    if (proposal.status !== "pending" && !stale) return fail("CONFLICT");
    const claimed = {
      ...proposal,
      status: "applying" as const,
      claimedAt: new Date().toISOString(),
    };
    await tx
      .update(assistantMessages)
      .set({
        content: {
          ...content,
          proposals: content.proposals.map((p) => (p.id === proposalId ? claimed : p)),
        },
      })
      .where(eq(assistantMessages.id, messageId));
    return ok({
      proposal: { ...proposal, status: "pending" as const },
      sportKey: conversation.sportKey,
    });
  });
}

async function settle(
  actor: Actor,
  messageId: string,
  proposalId: string,
  change: (p: Proposal) => Proposal,
): Promise<MessageContent | null> {
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.id, messageId))
      .for("update")
      .limit(1);
    const parsed = row ? messageContentSchema.safeParse(row.content) : null;
    if (!parsed?.success) return null;
    const next = {
      ...parsed.data,
      proposals: parsed.data.proposals.map((p) => (p.id === proposalId ? change(p) : p)),
    };
    await tx
      .update(assistantMessages)
      .set({ content: next })
      .where(eq(assistantMessages.id, messageId));
    return next;
  });
}

export async function applyProposalInMessage(
  actor: Actor,
  input: { messageId: string; proposalId: string; confirmed: boolean },
  labels: GenerationLabels,
): Promise<Result<ApplyResult & { content: MessageContent }>> {
  if (!isUuid(input.messageId) || input.proposalId.length < 8) return fail("NOT_FOUND");
  const claimed = await claim(actor, input.messageId, input.proposalId);
  if (!claimed.ok) return claimed;
  const { proposal, sportKey } = claimed.data;

  let result: Result<ApplyResult>;
  try {
    result = await applyProposal(actor, sportKey, proposal, { confirmed: input.confirmed, labels });
  } catch {
    result = fail("INTERNAL");
  }

  // a missing confirmation is not a failure of the proposal: it goes back to waiting, so the coach can confirm and apply
  const needsConfirmation = !result.ok && result.error.fields?.confirmed !== undefined;
  const content = await settle(actor, input.messageId, input.proposalId, (p) => {
    const { claimedAt: _claimedAt, ...rest } = p;
    void _claimedAt;
    if (needsConfirmation) return { ...rest, status: "pending" } as Proposal;
    if (result.ok)
      return {
        ...rest,
        status: "applied",
        ...(rest.kind === "create_session" && result.data.planId
          ? { createdPlanId: result.data.planId }
          : {}),
      } as Proposal;
    return { ...rest, status: "failed", error: result.error.code } as Proposal;
  });
  if (!content) return fail("INTERNAL");
  if (!result.ok) return result;
  return ok({ ...result.data, content });
}

export async function dismissProposalInMessage(
  actor: Actor,
  input: { messageId: string; proposalId: string },
): Promise<Result<{ content: MessageContent }>> {
  if (!isUuid(input.messageId) || input.proposalId.length < 8) return fail("NOT_FOUND");
  const content = await settle(actor, input.messageId, input.proposalId, (p) =>
    p.status === "pending" ? ({ ...p, status: "dismissed" } as Proposal) : p,
  );
  return content ? ok({ content }) : fail("NOT_FOUND");
}
