import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "AI Coach" };

/** "AI Coach" in the main navigation: straight into the basketball workspace (there is no sport to choose). */
export default async function AICoachIndexPage() {
  await requireViewer();
  redirect(`/assistant/${PRIMARY_SPORT_KEY}`);
}
