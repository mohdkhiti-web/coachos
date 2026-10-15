import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Sessions" };

/** "Sessions" in the main navigation: straight into the basketball workspace (there is no sport to choose). */
export default async function SessionsIndexPage() {
  await requireViewer();
  redirect(`/sessions/${PRIMARY_SPORT_KEY}`);
}
