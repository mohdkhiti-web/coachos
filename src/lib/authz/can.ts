/**
 * Central authorization policy (ARCHITECTURE.md §6.2). Pure and table-driven — no I/O, no
 * framework imports — so the whole role × action × resource matrix is unit-tested.
 *
 * Rules that this module enforces by construction:
 *  - A platform `super_admin` is NOT a bypass of tenancy (§6.3 rule 4). Support access goes
 *    through a separate, audited admin path (Phase 12).
 *  - Ownership/tenancy always comes from the session-derived Actor, never from client input:
 *    callers pass the *resource as loaded from the database*, and it must belong to the actor.
 */

export const MEMBERSHIP_ROLES = ["owner", "admin", "coach", "teacher", "assistant"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const PLATFORM_ROLES = ["user", "super_admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** The authenticated principal, derived server-side from the session (never from the client). */
export type Actor = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  platformRole: PlatformRole;
  sessionId: string;
};

const ALL: readonly MembershipRole[] = MEMBERSHIP_ROLES;
const MANAGERS: readonly MembershipRole[] = ["owner", "admin"];

/**
 * scope:
 *  - "self": the resource must belong to the acting user (`resource.userId === actor.userId`)
 *  - "org":  the resource must belong to the actor's active organization
 */
type Rule = { roles: readonly MembershipRole[]; scope: "self" | "org" };

export const POLICY = {
  "profile:read": { roles: ALL, scope: "self" },
  "profile:update": { roles: ALL, scope: "self" },
  "account:delete": { roles: ALL, scope: "self" },
  "session:read": { roles: ALL, scope: "self" },
  "session:revoke": { roles: ALL, scope: "self" },
  "audit:read": { roles: ALL, scope: "self" },
  "organization:read": { roles: ALL, scope: "org" },
  "organization:update": { roles: MANAGERS, scope: "org" },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof POLICY;

export type Resource = { userId: string } | { organizationId: string };

export function can(actor: Actor, action: Action, resource: Resource): boolean {
  const rule: Rule = POLICY[action];
  if (!rule.roles.includes(actor.role)) return false;
  if (rule.scope === "self") {
    return "userId" in resource && resource.userId === actor.userId;
  }
  return "organizationId" in resource && resource.organizationId === actor.organizationId;
}
