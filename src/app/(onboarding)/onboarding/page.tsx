import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OnboardingForm } from "@/components/features/account/onboarding-form";
import { listTimezones } from "@/lib/timezones";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const viewer = await requireViewer({ onboarding: "skip" });
  if (viewer.profile.onboardingCompleted) redirect("/dashboard");
  const t = await getTranslations("onboarding");

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow text-accent">{t("eyebrow")}</p>
        <h1 className="display text-4xl text-ink sm:text-5xl">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </div>
      <OnboardingForm defaultName={viewer.user.name} timezones={listTimezones()} />
    </div>
  );
}
