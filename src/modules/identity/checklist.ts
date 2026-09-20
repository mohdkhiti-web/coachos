import type { ProfileDto } from "./viewer";

/**
 * The dashboard's setup checklist is DERIVED from real account state — never hand-maintained
 * flags (ARCHITECTURE.md §23.1 "dashboard honesty"). Pure, so it is unit-tested.
 *
 * Deliberately absent: "Add a profile photo". Avatar upload needs the storage layer
 * (Cloudflare R2), which is deferred; the item appears when the feature actually works.
 */
export type ChecklistItemId = "email_verified" | "profile_complete" | "preferences";

export type ChecklistItem = {
  id: ChecklistItemId;
  done: boolean;
  /** Where to go to finish it (only for items the user can act on). */
  href?: string;
};

export function buildSetupChecklist(input: {
  user: { emailVerified: boolean; name: string };
  profile: Pick<
    ProfileDto,
    "profession" | "timezone" | "onboardingCompleted" | "preferencesReviewed"
  >;
}): ChecklistItem[] {
  const { user, profile } = input;
  return [
    { id: "email_verified", done: user.emailVerified },
    {
      id: "profile_complete",
      done:
        profile.onboardingCompleted &&
        user.name.trim().length > 0 &&
        !!profile.profession &&
        !!profile.timezone,
      href: "/settings/profile",
    },
    { id: "preferences", done: profile.preferencesReviewed, href: "/settings/preferences" },
  ];
}
