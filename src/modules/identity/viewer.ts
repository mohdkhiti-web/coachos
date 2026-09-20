import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { profiles } from "@/db/schema";
import type { Profession, Units } from "@/db/enums";
import { userTx } from "@/lib/db/tx";
import type { Actor, MembershipRole, PlatformRole } from "@/lib/authz/can";
import { MEMBERSHIP_ROLES, PLATFORM_ROLES } from "@/lib/authz/can";
import {
  ensureAccountFoundation,
  findMembership,
  getOrganizationById,
  type OrganizationDto,
  type WorkspaceRef,
} from "@/modules/organizations";
import { auth } from "./auth";

export type ProfileDto = {
  profession: Profession | null;
  timezone: string | null;
  locale: string;
  units: Units;
  onboardingCompleted: boolean;
  preferencesReviewed: boolean;
};

export type Viewer = {
  actor: Actor;
  user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date };
  profile: ProfileDto;
  organization: OrganizationDto;
};

async function loadProfile(userId: string): Promise<ProfileDto | null> {
  const [row] = await userTx(userId, (tx) =>
    tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
  );
  if (!row) return null;
  return {
    profession: row.profession,
    timezone: row.timezone,
    locale: row.locale,
    units: row.units,
    onboardingCompleted: row.onboardingCompletedAt !== null,
    preferencesReviewed: row.preferencesReviewedAt !== null,
  };
}

const asRole = (v: string): MembershipRole =>
  (MEMBERSHIP_ROLES as readonly string[]).includes(v) ? (v as MembershipRole) : "assistant"; // unknown => least privilege
const asPlatformRole = (v: string): PlatformRole =>
  (PLATFORM_ROLES as readonly string[]).includes(v) ? (v as PlatformRole) : "user";

/**
 * Resolve who is making this request, from the DATABASE-backed session (ARCHITECTURE.md §5.4):
 * the real authentication check. Memoised per request with React `cache()`.
 *
 * Returns null when unauthenticated. Never redirects — layouts use this for display only,
 * because layouts don't re-render on client navigation and therefore must not make auth decisions.
 * Pages and Server Actions call `requireViewer()`.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { user, session: s } = session;
  // requireEmailVerification means an unverified user never gets a session; belt and braces.
  if (!user.emailVerified) return null;

  // The session's active org is a claim; verify membership instead of trusting it (§6.3).
  let ws: WorkspaceRef | null = s.activeOrganizationId
    ? await findMembership(user.id, s.activeOrganizationId)
    : null;
  let profile = await loadProfile(user.id);
  if (!ws || !profile) {
    ws = await ensureAccountFoundation(user.id); // self-heal an incomplete sign-up
    profile = await loadProfile(user.id);
  }
  if (!ws || !profile) return null;

  const organization = await getOrganizationById(ws.organizationId);
  if (!organization) return null;

  return {
    actor: {
      userId: user.id,
      organizationId: ws.organizationId,
      role: asRole(ws.role),
      platformRole: asPlatformRole(String((user as { role?: string }).role ?? "user")),
      sessionId: s.id,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
    profile,
    organization,
  };
});

/**
 * For pages and Server Actions. Redirects to sign-in when unauthenticated and to onboarding until
 * the profile is complete (pass `onboarding: "skip"` on the onboarding page itself).
 * Note: `redirect()` throws — never call this inside try/catch.
 */
export async function requireViewer(
  opts: { onboarding?: "required" | "skip" } = {},
): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (opts.onboarding !== "skip" && !viewer.profile.onboardingCompleted) redirect("/onboarding");
  return viewer;
}
