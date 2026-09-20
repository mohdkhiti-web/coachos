import "server-only";
import { desc } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import { userTx } from "@/lib/db/tx";
import { can, type Actor } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";

export type AuditEventDto = {
  id: string;
  action: string;
  occurredAt: Date;
};

/** The acting user's own recent security/account activity (RLS also restricts this to them). */
export async function listOwnActivity(actor: Actor, limit = 10): Promise<AuditEventDto[]> {
  if (!can(actor, "audit:read", { userId: actor.userId })) throw new AppError("FORBIDDEN");
  return userTx(actor.userId, async (tx) => {
    const rows = await tx
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit);
    return rows;
  });
}
