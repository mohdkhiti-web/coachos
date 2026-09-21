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
 *  - "plan":  session-specific rules (visibility, creator, workspace managers) — see `planAllows`
 *  - "template": saved-template rules (visibility, creator, workspace managers) — see `templateAllows`
 *  - "media": stored images (logos): workspace-wide to read and use, deleted by their uploader or a manager — see `mediaAllows`
 */
type Rule = {
  roles: readonly MembershipRole[];
  scope: "self" | "org" | "drill" | "plan" | "template" | "media";
};

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

  // Sessions / plans (Step 2 of the session-creator work). Assistants read; they do not author.
  "plan:read": { roles: ALL, scope: "plan" },
  "plan:create": { roles: AUTHORS, scope: "org" },
  /** Edit the session, its objectives and its timeline; change its status (draft / published / archived). */
  "plan:update": { roles: AUTHORS, scope: "plan" },
  /** Delete (soft) and restore. */
  "plan:delete": { roles: AUTHORS, scope: "plan" },
  /** Copy a session you can read into your own workspace (as a private draft). */
  "plan:duplicate": { roles: AUTHORS, scope: "plan" },
  /** Make, regenerate and revoke the secure read-only link of a live session (Step 7). */
  "plan:share": { roles: AUTHORS, scope: "plan" },

  // Saved templates (Step 5). Everyone in the workspace may READ (and use) what is shared with it; only authors create.
  "template:read": { roles: ALL, scope: "template" },
  "template:create": { roles: AUTHORS, scope: "org" },
  /** Edit, archive and restore. */
  "template:update": { roles: AUTHORS, scope: "template" },
  "template:delete": { roles: AUTHORS, scope: "template" },
  /** Copy a template you can read into your own workspace (as a private one). */
  "template:duplicate": { roles: AUTHORS, scope: "template" },

  // Logos (Step 7): every member may use the workspace's logos; authors upload; the uploader or a manager deletes.
  "logo:read": { roles: ALL, scope: "media" },
  "logo:create": { roles: AUTHORS, scope: "org" },
  "logo:delete": { roles: AUTHORS, scope: "media" },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof POLICY;

/** A drill as loaded from the database — the only shape drill rules accept. */
export type DrillResource = {
  organizationId: string;
  createdBy: string | null;
  visibility: "private" | "organization" | "public";
  status?: string;
};

/** A session (plan) as loaded from the database — the only shape plan rules accept. */
export type PlanResource = {
  organizationId: string;
  createdBy: string | null;
  visibility: "private" | "organization";
  status?: string;
};

/** A saved template as loaded from the database — the only shape template rules accept. */
export type TemplateResource = {
  organizationId: string;
  createdBy: string | null;
  visibility: "private" | "organization";
  status?: string;
};

/** A stored image (logo) as loaded from the database. Always workspace-wide: `visibility` is fixed so it fits the shared shape. */
export type MediaResource = {
  organizationId: string;
  createdBy: string | null;
  visibility: "organization";
};

export type Resource =
  | { userId: string }
  | { organizationId: string }
  | DrillResource
  | PlanResource
  | TemplateResource
  | MediaResource;

/** Drills and plans both carry a workspace, a creator and a visibility; the rule (by scope) says what that means. */
const isOwnedResource = (
  r: Resource,
): r is DrillResource | PlanResource | TemplateResource | MediaResource =>
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

/**
 * Session rules, mirrored by row-level security (drizzle/0005_*.sql):
 *  - read:   my workspace's sessions, except other people's private ones. Nobody reads another workspace's.
 *  - change: only what I can read, by its creator or an owner/admin of the workspace. Assistants never.
 *  - duplicate: anything I can read, as an author (the copy is mine).
 * (Whether a session is archived or deleted is a matter for the command, not for ownership.)
 */
function planAllows(action: Action, actor: Actor, p: PlanResource): boolean {
  const canRead =
    p.organizationId === actor.organizationId &&
    (p.visibility === "organization" || p.createdBy === actor.userId);
  switch (action) {
    case "plan:read":
    case "plan:duplicate":
      return canRead;
    case "plan:update":
    case "plan:delete":
    case "plan:share":
      return canRead && (p.createdBy === actor.userId || MANAGERS.includes(actor.role));
    default:
      return false;
  }
}

/**
 * Template rules, mirrored by row-level security (drizzle/0010_*.sql):
 *  - read:   my workspace's templates, except other people's private ones (as for sessions and drills).
 *  - change: only what I can read, by its creator or an owner/admin. Assistants never author.
 *  - duplicate: anything I can read, as an author (the copy is mine and private).
 * (Archived and deleted are matters for the command, not for ownership.)
 */
function templateAllows(action: Action, actor: Actor, t: TemplateResource): boolean {
  const inMyOrg = t.organizationId === actor.organizationId;
  const canRead = inMyOrg && (t.visibility === "organization" || t.createdBy === actor.userId);
  switch (action) {
    case "template:read":
    case "template:duplicate":
      return canRead;
    case "template:update":
    case "template:delete":
      return canRead && (t.createdBy === actor.userId || MANAGERS.includes(actor.role));
    default:
      return false;
  }
}

/** Logo rules, mirrored by row-level security (drizzle/0011_*.sql): use = my workspace; delete = its uploader or an owner/admin. */
function mediaAllows(action: Action, actor: Actor, m: MediaResource): boolean {
  const inMyOrg = m.organizationId === actor.organizationId;
  switch (action) {
    case "logo:read":
      return inMyOrg;
    case "logo:delete":
      return inMyOrg && (m.createdBy === actor.userId || MANAGERS.includes(actor.role));
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
  if (!isOwnedResource(resource)) return false;
  if (rule.scope === "plan") return planAllows(action, actor, resource as PlanResource);
  if (rule.scope === "template") return templateAllows(action, actor, resource as TemplateResource);
  if (rule.scope === "media") return mediaAllows(action, actor, resource as MediaResource);
  return drillAllows(action, actor, resource as DrillResource);
}
