import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { member, organization, profiles, user } from "@/db/schema";
import { db } from "@/lib/db/client";
import { userTx, tenantTx } from "@/lib/db/tx";
import { newId } from "@/lib/ids";
import { can, type Actor, type MembershipRole } from "@/lib/authz/can";
import { AppError } from "@/lib/errors";
import { recordAuditInTx } from "@/modules/audit";

/**
 * Every user has a personal organization (ARCHITECTURE.md §7.1): solo coaches, schools and
 * academies are the same data model, and every tenant row carries an organization_id from day one.
 */

export type WorkspaceRef = { organizationId: string; role: MembershipRole };

function defaultWorkspaceName(userName: string): string {
  const first = userName.trim().split(/\s+/)[0] ?? "";
  return first ? `${first}'s workspace` : "My workspace";
}

/**
 * Idempotently guarantees the account foundation for a user: personal organization + owner
 * membership + profile row, in ONE transaction (all-or-nothing). Safe to call repeatedly; it is
 * called at sign-up and again defensively at sign-in so a half-completed sign-up self-heals.
 *
 * Identity-flow internal: runs before any Actor exists, hence keyed by userId.
 */
export async function ensureAccountFoundation(userId: string): Promise<WorkspaceRef> {
  return userTx(userId, async (tx) => {
    const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
    if (!u) throw new AppError("NOT_FOUND", "user not found");

    // profiles is RLS-protected (user-scoped); this insert passes because userTx set app.user_id.
    await tx.insert(profiles).values({ userId }).onConflictDoNothing();

    const existing = await tx
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, userId), eq(organization.type, "personal")))
      .limit(1);
    if (existing[0]) {
      return {
        organizationId: existing[0].organizationId,
        role: existing[0].role as MembershipRole,
      };
    }

    const organizationId = newId();
    await tx.insert(organization).values({
      id: organizationId,
      name: defaultWorkspaceName(u.name),
      slug: `personal-${userId}`,
      type: "personal",
    });
    await tx.insert(member).values({ id: newId(), organizationId, userId, role: "owner" });
    return { organizationId, role: "owner" as const };
  });
}

/** The membership of a user in a specific organization, or null (never trust the session's claim alone). */
export async function findMembership(
  userId: string,
  organizationId: string,
): Promise<WorkspaceRef | null> {
  const [row] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return row ? { organizationId: row.organizationId, role: row.role as MembershipRole } : null;
}

export type OrganizationDto = { id: string; name: string; type: string };

export async function getOrganizationById(organizationId: string): Promise<OrganizationDto | null> {
  const [row] = await db
    .select({ id: organization.id, name: organization.name, type: organization.type })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

export async function renameWorkspace(actor: Actor, name: string): Promise<void> {
  if (!can(actor, "organization:update", { organizationId: actor.organizationId })) {
    throw new AppError("FORBIDDEN");
  }
  await tenantTx(actor, async (tx) => {
    const updated = await tx
      .update(organization)
      .set({ name })
      .where(eq(organization.id, actor.organizationId))
      .returning({ id: organization.id });
    if (updated.length === 0) throw new AppError("NOT_FOUND");
    await recordAuditInTx(tx, actor, {
      action: "organization.renamed",
      entityType: "organization",
      entityId: actor.organizationId,
    });
  });
}

/**
 * Account erasure (GDPR): remove the personal organizations a user owns. Their tenant rows go with
 * them via ON DELETE CASCADE as more tables arrive. Called from the identity delete-user hook.
 */
export async function deletePersonalWorkspacesOf(userId: string): Promise<void> {
  const owned = await db
    .select({ id: organization.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(eq(member.userId, userId), eq(member.role, "owner"), eq(organization.type, "personal")),
    );
  if (owned.length === 0) return;
  await db.delete(organization).where(
    inArray(
      organization.id,
      owned.map((o) => o.id),
    ),
  );
}
