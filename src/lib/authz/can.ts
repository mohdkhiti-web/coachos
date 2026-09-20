/**
 * Central authorization policy (ARCHITECTURE.md §6.2). Pure and table-driven — no I/O, no
 * framework imports — so the whole role × action × resource matrix is unit-tested.
 *
 * Rules that this module enforces by construction:
 *  - A platform `super_admin` is NOT a bypass of tenancy (§6.3 rule 4). Support access goes
 *    through a separate, audited admin path (Phase 12).
 *  - Ownership/tenancy always comes from the session-derived Actor, never from client input:
 *    callers pass the *resource as loaded from the database*, and it must belong to the actor.
 *
 * `can()` is the SECOND layer. The first-class guarantee for tenant data is PostgreSQL row-level
 * security, which enforces the same rules in the database (see drizzle/0003_*.sql).
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
/** Roles that may author content (assistants read and run sessions, they don't edit the library). */
const AUTHORS: readonly MembershipRole[] = ["owner", "admin", "coach", "teacher"];

/**
 * scope:
 *  - "self":  the resource must belong to the acting user (`resource.userId === actor.userId`)
 *  - "org":   the resource must belong to the actor's active organization
 *  - "drill": drill-specific rules (visibility, creator, library) — see `drillAllows`
 */
type Rule = { roles: readonly MembershipRole[]; scope: "self" | "org" | "drill" };

export const POLICY = {
  "profile:read": { roles: ALL, scope: "self" },
  "profile:update": { roles: ALL, scope: "self" },
  "account:delete": { roles: ALL, scope: "self" },
  "session:read": { roles: ALL, scope: "self" },
  "session:revoke": { roles: ALL, scope: "self" },
  "audit:read": { roles: ALL, scope: "self" },
  "organization:read": { roles: ALL, scope: "org" },
  "organization:update": { roles: MANAGERS, scope: "org" },

  // Drills (Phase 2)
  "drill:read": { roles: ALL, scope: "drill" },
  "drill:create": { roles: AUTHORS, scope: "org" },
  "drill:update": { roles: AUTHORS, scope: "drill" },
  "drill:archive": { roles: AUTHORS, scope: "drill" },
  "drill:duplicate": { roles: AUTHORS, scope: "drill" },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof POLICY;

/** A drill as loaded from the database — the only shape drill rules accept. */
export type DrillResource = {
  organizationId: string;
  createdBy: string | null;
  visibility: "private" | "organization" | "public";
  status?: string;
};

export type Resource = { userId: string } | { organizationId: string } | DrillResource;

const isDrillResource = (r: Resource): r is DrillResource =>
  "organizationId" in r && "visibility" in r && "createdBy" in r;

/**
 * Drill rules (ARCHITECTURE.md §7.3), mirrored by row-level security:
 *  - read:      public published library rows (anyone) · my organization's drills, except other people's private ones
 *  - change:    only non-library drills in MY organization, by their creator or an owner/admin
 *  - duplicate: anything I can read (copying into my own workspace is how library drills get customised)
 */
function drillAllows(action: Action, actor: Actor, d: DrillResource): boolean {
  const inMyOrg = d.organizationId === actor.organizationId;
  const canRead =
    (d.visibility === "public" && (d.status ?? "published") === "published") ||
    (inMyOrg && (d.visibility !== "private" || d.createdBy === actor.userId));

  switch (action) {
    case "drill:read":
    case "drill:duplicate":
      return canRead;
    case "drill:update":
    case "drill:archive":
      return (
        inMyOrg &&
        d.visibility !== "public" &&
        (d.createdBy === actor.userId || MANAGERS.includes(actor.role))
      );
    default:
      return false;
  }
}

export function can(actor: Actor, action: Action, resource: Resource): boolean {
  const rule: Rule = POLICY[action];
  if (!rule.roles.includes(actor.role)) return false;
  if (rule.scope === "self") return "userId" in resource && resource.userId === actor.userId;
  if (rule.scope === "org")
    return "organizationId" in resource && resource.organizationId === actor.organizationId;
  return isDrillResource(resource) && drillAllows(action, actor, resource);
}
