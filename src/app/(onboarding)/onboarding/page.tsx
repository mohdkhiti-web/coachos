import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoachOnboarding } from "@/components/features/onboarding/coach-onboarding";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Build your coaching profile" };

export default async function OnboardingPage() {
  const viewer = await requireViewer({ onboarding: "skip" });
  if (viewer.profile.onboardingCompleted) redirect("/dashboard");
  // Apple can withhold a name: only then is the coach asked for one (on the last question).
  return <CoachOnboarding needsName={viewer.user.name.trim().length === 0} />;
}
