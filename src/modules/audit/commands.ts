import "server-only";
import { auditEvents } from "@/db/schema";
import { anonymousTx, tenantTx, userTx } from "@/lib/db/tx";
import type { Tx } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";

/**
 * Audit action vocabulary. Add new actions here so the UI can translate them
 * (messages/en.json → `audit.events.<action with . replaced by _>`).
 */
export type AuditAction =
  | "auth.sign_up"
  | "auth.sign_in"
  | "auth.sign_in_failed"
  | "auth.session_revoked"
  | "auth.email_verified"
  | "auth.password_changed"
  | "auth.password_reset"
  | "auth.email_change_requested"
  | "account.onboarded"
  | "account.profile_updated"
  | "account.preferences_updated"
  | "account.deleted"
  | "organization.renamed"
  | "drill.created"
  | "drill.updated"
  | "drill.archived"
  | "drill.duplicated"
  | "plan.created"
  | "plan.updated"
  | "plan.status_changed"
  | "plan.deleted"
  | "plan.restored"
  | "plan.duplicated"
  | "plan.template_applied"
  | "plan.template_detached"
  | "template.created"
  | "template.updated"
  | "template.status_changed"
  | "template.deleted"
  | "template.restored"
  | "template.duplicated";

export type AuditContext = { userId?: string | null; organizationId?: string | null };

export type AuditInput = {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  /** ids, enum-like values and counts only — never PII or free text (§3.4). */
  metadata?: Record<string, string | number | boolean | null>;
};

function row(ctx: AuditContext, input: AuditInput) {
  return {
    id: newId(),
    userId: ctx.userId ?? null,
    organizationId: ctx.organizationId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    ip: input.ip ?? null,
    metadata: input.metadata ?? {},
  };
}

/** Write inside the caller's transaction (preferred: audit and change commit together, §19.4). */
export async function recordAuditInTx(tx: Tx, ctx: AuditContext, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values(row(ctx, input));
}

/**
 * Standalone write for events that have no surrounding command transaction (auth hooks).
 * Never throws: failing to write an audit row must not break sign-in — it is logged loudly instead.
 */
export async function recordAudit(ctx: AuditContext, input: AuditInput): Promise<void> {
  try {
    const insert = (tx: Tx) => recordAuditInTx(tx, ctx, input);
    if (ctx.userId && ctx.organizationId) {
      await tenantTx({ userId: ctx.userId, organizationId: ctx.organizationId }, insert);
    } else if (ctx.userId) {
      await userTx(ctx.userId, insert);
    } else {
      await anonymousTx(insert);
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), action: input.action },
      "audit.write_failed",
    );
  }
}
