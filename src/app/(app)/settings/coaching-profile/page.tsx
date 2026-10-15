import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CoachingProfileForm } from "@/components/features/onboarding/coaching-profile-form";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Coaching profile" };

export default async function CoachingProfileSettingsPage() {
  const { profile } = await requireViewer();
  const t = await getTranslations("settings.coachingProfile");
  return (
    <>
      <p className="text-base text-ink-muted">{t("subtitle")}</p>
      <CoachingProfileForm initial={profile.coaching} />
    </>
  );
}
