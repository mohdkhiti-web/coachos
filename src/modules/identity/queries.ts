import "server-only";
import { headers } from "next/headers";
import { can, type Actor } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";
import { auth } from "./auth";

export type SessionDto = {
  id: string;
  isCurrent: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * The acting user's own sessions. Better Auth returns the secret session `token` too — it is
 * deliberately NOT part of the DTO, so it can never reach the browser.
 */
export async function listOwnSessions(actor: Actor): Promise<SessionDto[]> {
  if (!can(actor, "session:read", { userId: actor.userId })) throw new AppError("FORBIDDEN");
  const rows = await auth.api.listSessions({ headers: await headers() });
  return rows
    .map((s) => ({
      id: s.id,
      isCurrent: s.id === actor.sessionId,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
      createdAt: new Date(s.createdAt),
      expiresAt: new Date(s.expiresAt),
    }))
    .sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent) || b.createdAt.getTime() - a.createdAt.getTime(),
    );
}

/** Revoke one of the actor's *other* sessions by id (resolved to its secret token server-side). */
export async function revokeOwnSession(
  actor: Actor,
  sessionId: string,
): Promise<"revoked" | "not_found" | "is_current"> {
  if (!can(actor, "session:revoke", { userId: actor.userId })) throw new AppError("FORBIDDEN");
  if (sessionId === actor.sessionId) return "is_current";
  const h = await headers();
  const rows = await auth.api.listSessions({ headers: h });
  const target = rows.find((s) => s.id === sessionId); // lookup within the user's own list = ownership proof
  if (!target) return "not_found";
  await auth.api.revokeSession({ headers: h, body: { token: target.token } });
  return "revoked";
}
